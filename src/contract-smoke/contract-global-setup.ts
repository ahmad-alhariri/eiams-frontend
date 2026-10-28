/** Contract-smoke global setup — starts Vite dev server on 5188 with proxy.
 * Default export = setup; returned function = teardown.
 */
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
/* ViteDevServer type used in teardown signature below */
import { CONTRACT_DEV_PORT, CONTRACT_PROXY_TARGET } from './contract-origin'

export default async function setup(): Promise<() => Promise<void>> {
  process.env['EIAMS_DEV_PROXY_TARGET'] = CONTRACT_PROXY_TARGET
  process.env['MODE'] = 'development'
  const server: ViteDevServer = await createServer({
    root: process.cwd(),
    server: { port: CONTRACT_DEV_PORT, strictPort: true, host: '127.0.0.1' },
    logLevel: 'silent',
  })
  await server.listen()
  return async () => {
    await server.close()
  }
}
