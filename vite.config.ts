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
    },
  }
})
