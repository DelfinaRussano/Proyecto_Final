export interface AuthUser {
  id: number
  username: string
}

export interface AuthSession {
  token: string
  user: AuthUser
}

const authTokenStorageKey = 'flagquest-auth-token-v1'

export function getStoredAuthToken() {
  return localStorage.getItem(authTokenStorageKey)
}

export function storeAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(authTokenStorageKey, token)
  } else {
    localStorage.removeItem(authTokenStorageKey)
  }
}

async function requestAuth<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'No se pudo completar la solicitud.'
    throw new Error(message)
  }

  return body as T
}

export function registerAccount(username: string, password: string) {
  return requestAuth<AuthSession>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function loginAccount(username: string, password: string) {
  return requestAuth<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function getCurrentUser(token: string) {
  return requestAuth<{ user: AuthUser }>('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function logoutAccount(token: string) {
  return requestAuth<void>('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}
