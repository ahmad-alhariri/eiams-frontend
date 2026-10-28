import { describe, expect, it } from 'vitest'
import axios from 'axios'
import { createAxiosTransport } from './axios-transport'

/**
 * Lock the production unwrap behavior chosen in `axios-transport.ts`: the
 * shared `unwrapData` helper is the single unwrap point. A normal success
 * envelope yields the identity payload; a malformed 2xx body (missing `data`)
 * now throws instead of yielding `undefined`.
 */
describe('production transport unwrap', () => {
  it('returns the identity payload for a well-formed success envelope', async () => {
    const payload = { id: 'item-42', name: 'test-item' }
    const client = axios.create()
    // Mock the axios response shape so `client.request` resolves to the envelope
    const mockResponse = async (): Promise<{
      data: {
        success: true
        data: typeof payload
        pagination: null
        meta: { request_id: string; timestamp: string }
      }
      status: number
      statusText: string
      headers: Record<string, unknown>
      config: unknown
    }> => ({
      data: {
        success: true,
        data: payload,
        pagination: null,
        meta: { request_id: 'r-1', timestamp: '2026-01-01T00:00:00.000Z' },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    })
    ;(client.request as typeof mockResponse) = mockResponse

    const transport = createAxiosTransport(client)
    const result = await transport.request({ path: '/items/42', method: 'GET' })
    expect(result).toEqual(payload)
  })

  it('rejects a malformed 2xx body (missing data) instead of yielding undefined', async () => {
    const client = axios.create()
    // A 2xx response with an envelope missing `data`: `unwrapData` validates
    // via `isApiSuccessResponse`, which requires `success === true` and `'data' in value`.
    const mockResponse2 = async (): Promise<{
      data: { success: true; pagination: null; meta: { request_id: string; timestamp: string } }
      status: number
      statusText: string
      headers: Record<string, unknown>
      config: unknown
    }> => ({
      data: {
        success: true,
        pagination: null,
        meta: { request_id: 'r-1', timestamp: '2026-01-01T00:00:00.000Z' },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    })
    ;(client.request as typeof mockResponse2) = mockResponse2

    const transport = createAxiosTransport(client)
    await expect(transport.request({ path: '/bad', method: 'GET' })).rejects.toThrow()
  })

  it('tolerates a no-content 2xx without throwing', async () => {
    const client = axios.create()
    const mockResponseEmpty = async (): Promise<{
      data: null
      status: number
      statusText: string
      headers: Record<string, unknown>
      config: unknown
    }> => ({
      data: null,
      status: 204,
      statusText: 'No Content',
      headers: {},
      config: {},
    })
    ;(client.request as typeof mockResponseEmpty) = mockResponseEmpty

    const transport = createAxiosTransport(client)
    const resultRequest = await transport.request({ path: '/empty', method: 'GET' })
    expect(resultRequest).toBeUndefined()
  })

  it('tolerates an empty-string 2xx body for requestPage and yields an empty list', async () => {
    const client = axios.create()
    const mockResponseString = async (): Promise<{
      data: ''
      status: number
      statusText: string
      headers: Record<string, unknown>
      config: unknown
    }> => ({
      data: '',
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    })
    ;(client.request as typeof mockResponseString) = mockResponseString

    const transport = createAxiosTransport(client)
    const resultPage = await transport.requestPage({ path: '/page-empty', method: 'GET' })
    expect(resultPage.items).toEqual([])
  })

  it('still throws on a genuinely malformed non-empty body', async () => {
    const client = axios.create()
    const mockResponseMalformed = async (): Promise<{
      data: { unexpected: true }
      status: number
      statusText: string
      headers: Record<string, unknown>
      config: unknown
    }> => ({
      data: { unexpected: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    })
    ;(client.request as typeof mockResponseMalformed) = mockResponseMalformed

    const transport = createAxiosTransport(client)
    await expect(transport.request({ path: '/bad-body', method: 'GET' })).rejects.toThrow(
      'envelope',
    )
  })
})
