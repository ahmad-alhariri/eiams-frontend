import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    name: 'contract-smoke',
    environment: 'node',
    include: ['src/contract-smoke/**/*.contract-smoke.ts'],
    globalSetup: ['./src/contract-smoke/contract-global-setup.ts'],
    setupFiles: [], // must NOT import src/test/setup.ts
    testTimeout: 60_000,
    hookTimeout: 60_000,
    /**
     * ONE worker, NO isolation: the module-level request budget singleton
     * (src/contract-smoke/contract-budget.ts) and the wire-code registry must
     * be SHARED by every test file, or the suite would burst the backend's
     * measured rate limits. Vitest 4 has no `singleFork`; `fileParallelism`
     * + `isolate` is the supported way to run everything in one module graph.
     */
    fileParallelism: false,
    isolate: false,
    sequence: { concurrent: false },
  },
})
