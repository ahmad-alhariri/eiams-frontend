import { describe, expect, it } from 'vitest'

import { isUuidLike } from '@/shared/utils/uuid'

/**
 * The backend's identifiers are .NET `Guid` values, not RFC-4122 versioned UUIDs.
 *
 * The four well-known role ids are `00000000-0000-0000-0000-00000000000N`: their
 * RFC-9562 version nibble is `0` and their variant bits are `0`. Zod 4's `uuid()`
 * rejects exactly that shape, which once made a correctly selected role fail
 * validation while appearing selected, blocking the create-user form entirely. The
 * unit tests never saw it because every fixture generates a version-4 UUID.
 */
describe('isUuidLike', () => {
  it.each([
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004',
  ])('accepts the seeded role id %s', (id) => {
    expect(isUuidLike(id)).toBe(true)
  })

  it.each([
    ['a version-4 uuid', '00000000-0000-4000-8000-0000000000a1'],
    ['a random v4 uuid', '3f2504e0-4f89-41d3-9a0c-0305e82c3301'],
    ['uppercase', '3F2504E0-4F89-41D3-9A0C-0305E82C3301'],
    ['surrounding whitespace', '  00000000-0000-0000-0000-000000000001  '],
  ])('accepts %s', (_label, id) => {
    expect(isUuidLike(id)).toBe(true)
  })

  it.each([
    ['an empty string', ''],
    ['free text', 'site-1'],
    ['a uuid without dashes', '00000000000000000000000000000001'],
    ['too few groups', '00000000-0000-0000-0000-0001'],
    ['a non-hex character', '0000000g-0000-0000-0000-000000000001'],
    ['a trailing character', '00000000-0000-0000-0000-0000000000011'],
  ])('rejects %s', (_label, id) => {
    expect(isUuidLike(id)).toBe(false)
  })

  it('accepts what Zod 4 uuid() rejects, which is the whole point', async () => {
    const { z } = await import('zod')
    expect(z.uuid().safeParse('00000000-0000-0000-0000-000000000001').success).toBe(false)
    expect(isUuidLike('00000000-0000-0000-0000-000000000001')).toBe(true)
  })
})
