import { describe, expect, it, vi } from 'vitest'
import { createAxiosTransport } from '@/shared/api/axios-transport'
import { apiClient } from '@/shared/services/api.client'

describe('transport requestBlob (B2)', () => {
  it('exists and delegates through the shared axios instance (same as request/requestPage)', () => {
    const transport = createAxiosTransport(apiClient)
    expect(typeof transport.request).toBe('function')
    expect(typeof transport.requestPage).toBe('function')
    expect(typeof transport.requestBlob).toBe('function')
  })

  it('passes responseType blob to the underlying axios request (no validateStatus)', async () => {
    const spy = vi.spyOn(apiClient, 'request').mockResolvedValue({
      data: new Blob(['x']),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    } as never)
    const transport = createAxiosTransport(apiClient)
    await transport.requestBlob({ path: '/download', method: 'GET' })
    const cfg = spy.mock.calls[0]?.[0] as { responseType?: string; url?: string } | undefined
    expect(cfg?.responseType).toBe('blob')
    expect(cfg?.url).toBe('/download')
    spy.mockRestore()
  })
})
