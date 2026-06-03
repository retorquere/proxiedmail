import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'

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

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.stubGlobal('localStorage', createLocalStorageMock())
  })

  it('stores the API token and username after a successful login', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ data: { attributes: { token: 'oauth-token' } } })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: vi.fn().mockResolvedValue(JSON.stringify({ token: 'api-token' })),
      })

    vi.stubGlobal('fetch', fetchMock)

    const store = useAuthStore()
    await store.login('user@example.com', 'secret')

    expect(store.token).toBe('api-token')
    expect(store.loginUsername).toBe('user@example.com')
    expect(localStorage.getItem('api_token')).toBe('api-token')
    expect(localStorage.getItem('login_username')).toBe('user@example.com')
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/api-token', {
      headers: { Authorization: 'Bearer oauth-token' },
    })
  })

  it('throws the upstream auth message for invalid credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      text: vi.fn().mockResolvedValue(JSON.stringify([
        { data: { attributes: { message: 'Bad credentials' } } },
      ])),
    }))

    const store = useAuthStore()

    await expect(store.login('user@example.com', 'wrong-password')).rejects.toThrow('Bad credentials')
    expect(localStorage.getItem('api_token')).toBeNull()
  })
})
