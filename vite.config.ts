import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'

import { productionBuildOptions } from './src/config/production-build.ts'
import { resolveDevApiProxy } from './src/config/vite-dev-server.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const devApiProxy = resolveDevApiProxy(loadEnv(mode, process.cwd(), ''))

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: productionBuildOptions,
    ...(devApiProxy
      ? {
          server: {
            proxy: {
              [devApiProxy.context]: devApiProxy,
            },
          },
        }
      : {}),
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      /**
       * Vitest defaults to 5000 ms, which several suites exceed while PASSING.
       * `app-router.test.tsx`, `user-detail-page.test.tsx` and
       * `asset-disposal-form-page.test.tsx` each run 5-8 s of real work (MSW
       * interception, jsdom rendering, RTL user-event sequences) and all three
       * pass reliably in isolation — but under full-suite parallel load on a
       * busy machine they cross 5 s and fail, so the failing SET changes from
       * run to run on an unchanged tree. A timeout that fires on a correct test
       * is indistinguishable from a regression, which trains people to re-run
       * until it agrees, and a suite re-run until it agrees is not a gate.
       *
       * 20 s is deliberate rather than generous: still far below Vitest's
       * `hookTimeout`-scale hangs, so a genuinely deadlocked await is caught,
       * while giving ~3x headroom over the slowest real suite.
       */
      testTimeout: 20_000,
    },
  }
})
