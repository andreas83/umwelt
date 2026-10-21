import { parseArgs } from 'node:util';
import { loadModelsConfig, ModelRouter } from '@umwelt/gen-service';
import { checkModels } from './check.js';
import { writeGallery } from './gallery.js';
import { runJudge } from './judge.js';
import { modelsConfigPath } from './paths.js';
import { writeReport } from './report.js';
import { createRun, openRun } from './run-dir.js';
import { CONTENT_PROMPT, estimateCost, estimateJudgeCost, planTasks, runGeneration } from './run.js';
import { loadTestSet } from './testset.js';

const USAGE = `Usage: pnpm eval <command> [options]

  check                   one tiny call per model (keys, ids, params)
  run                     generate the test set; prints a cost estimate and stops unless --yes
  judge  --run <id>       score profile adherence of generated pages (judge role)
  report --run <id>       write summary.md / summary.csv
  gallery --run <id>      write the blind rating gallery + ratings.csv + key.csv

Options:
  --models a,b            model aliases (default: eval.candidates in config/models.yaml)
  --urls N                only the first N test URLs
  --profiles a,b          only these profile ids
  --run <id>              resume or target an existing run (data/eval/<id>)
  --concurrency N         parallel requests per model (default 3)
  --judge                 run the judge right after generation
  --yes                   actually spend money
`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    models: { type: 'string' },
    urls: { type: 'string' },
    profiles: { type: 'string' },
    run: { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    judge: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const command = positionals[0];
if (!command || values.help) {
  console.log(USAGE);
  process.exit(command ? 0 : 1);
}

const router = new ModelRouter(await loadModelsConfig(modelsConfigPath));
const models = values.models?.split(',') ?? router.config.eval.candidates;
const concurrency = Number(values.concurrency);
const set = await loadTestSet();
if (values.urls) set.urls = set.urls.slice(0, Number(values.urls));
if (values.profiles) {
  const ids = values.profiles.split(',');
  set.profiles = set.profiles.filter((p) => ids.includes(p.id));
}

const requireRun = () => {
  if (!values.run) throw new Error(`${command} needs --run <id>`);
  return openRun(values.run);
};

switch (command) {
  case 'check':
    process.exitCode = (await checkModels(router, models)) ? 0 : 1;
    break;

  case 'run': {
    const tasks = planTasks(models, set);
    const est = estimateCost(router, tasks);
    console.log(`${set.urls.length} URLs × ${set.profiles.length} profiles × ${models.length} models = ${tasks.length} pages`);
    for (const [m, e] of est) console.log(`  ${m.padEnd(22)} ${String(e.pages).padStart(4)} pages  ~$${e.usd.toFixed(2)}`);
    let total = [...est.values()].reduce((s, e) => s + e.usd, 0);
    if (values.judge) {
      const judgeUsd = estimateJudgeCost(router, tasks.length);
      console.log(`  ${`judge (${router.config.roles.judge})`.padEnd(22)} ${String(tasks.length).padStart(4)} pages  ~$${judgeUsd.toFixed(2)}`);
      total += judgeUsd;
    }
    console.log(`  estimated total ~$${total.toFixed(2)}`);
    if (!values.yes) {
      console.log('\nDry run. Re-run with --yes to start.');
      break;
    }
    const run = values.run ? await openRun(values.run) : await createRun(`${CONTENT_PROMPT.name}/${CONTENT_PROMPT.version}`);
    console.log(`run ${run.meta.runId} → ${run.dir}`);
    await runGeneration(run, router, tasks, concurrency);
    if (values.judge) await runJudge(run, router, set.profiles, concurrency);
    console.log('\n' + (await writeReport(run)));
    break;
  }

  case 'judge': {
    const run = await requireRun();
    await runJudge(run, router, set.profiles, concurrency);
    console.log('\n' + (await writeReport(run)));
    break;
  }

  case 'report':
    console.log(await writeReport(await requireRun()));
    break;

  case 'gallery': {
    const run = await requireRun();
    console.log(`gallery → ${await writeGallery(run, set.profiles)}`);
    break;
  }

  default:
    console.log(USAGE);
    process.exitCode = 1;
}
