import type { BuildOptions } from 'vite'

/**
 * Production output is deliberately conservative: modern browsers receive
 * split CSS and hashed static assets, while source maps stay out of the public
 * build. Deployment-specific headers and HTTPS termination remain host-owned.
 */
export const productionBuildOptions = Object.freeze({
  target: 'es2023',
  outDir: 'dist',
  assetsDir: 'assets',
  cssCodeSplit: true,
  sourcemap: false,
  reportCompressedSize: false,
} satisfies BuildOptions)
