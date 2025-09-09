import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // keep connections low for Neon free tier and avoid cross-file DB races
    pool: 'threads',
    poolOptions: { threads: { minThreads: 1, maxThreads: 1 } },
    sequence: { concurrent: false }, // within-file
  },
});
