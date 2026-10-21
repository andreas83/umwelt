// Model bake-off harness (Phase 1). Placeholder until the test set and router exist.
import { loadModelsConfig } from '@umwelt/gen-service';

const config = await loadModelsConfig(new URL('../../../config/models.yaml', import.meta.url).pathname);
console.log('Configured roles:', Object.keys(config.roles).join(', '));
