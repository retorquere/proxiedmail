import router from '../router'

const TOKEN_KEY = 'api_token'
const USERNAME_KEY = 'login_username'

function withAuthHeaders(init?: RequestInit): RequestInit {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return init ?? {}

  const headers = new Headers(init?.headers)
  headers.set('Token', token)
  headers.set('Authorization', `Bearer ${token}`)

  return {
    ...init,
    headers,
  }
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, withAuthHeaders(init))
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USERNAME_KEY)
    router.push('/login')
  }
  return res
}
