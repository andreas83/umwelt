import { defineConfig } from 'vitest/config';

// Tests resolve workspace packages to their TypeScript sources via the "source" export condition,
// so `pnpm test` works without a prior build.
export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
    include: ['{apps,packages}/*/src/**/*.test.ts'],
  },
});
