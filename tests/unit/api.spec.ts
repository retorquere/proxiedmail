import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}))

vi.mock('@/router', () => ({
  default: {
    push: pushMock,
  },
}))

import { apiFetch } from '@/utils/api'

type LocalStorageMock = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  clear: () => void
}

function createLocalStorageMock(): LocalStorageMock {
  const store = new Map<string, string>()

  return {
    getItem(key) {
      return store.get(key) ?? null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
    clear() {
      store.clear()
    },
  }
}

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    pushMock.mockReset()
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  it('adds auth headers when a token is present', async () => {
    localStorage.setItem('api_token', 'abc123')
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/api/v1/proxy-bindings', { headers: { Accept: 'application/json' } })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Token')).toBe('abc123')
    expect(headers.get('Authorization')).toBe('Bearer abc123')
  })

  it('clears auth state and redirects to login on a 401 response', async () => {
    localStorage.setItem('api_token', 'abc123')
    localStorage.setItem('login_username', 'user@example.com')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }))

    await apiFetch('/api/v1/proxy-bindings')

    expect(localStorage.getItem('api_token')).toBeNull()
    expect(localStorage.getItem('login_username')).toBeNull()
    expect(pushMock).toHaveBeenCalledWith('/login')
  })
})
