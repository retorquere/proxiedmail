import { describe, expect, it } from 'vitest'

import { generate, makeLocalPart } from '@/utils/generate'

describe('generate', () => {
  it('creates a capitalized name within the requested bounds', () => {
    const value = generate('given', 5, 9)

    expect(value).toMatch(/^[A-Z][a-z]+$/)
    expect(value.length).toBeGreaterThanOrEqual(5)
    expect(value.length).toBeLessThanOrEqual(9)
  })
})

describe('makeLocalPart', () => {
  it('creates a lowercase alias-like local part', () => {
    const value = makeLocalPart()

    expect(value).toMatch(/^[a-z]+(?:\.[a-z]+)?\.[a-z]+(?:-[a-z]+)?$/)
  })
})
