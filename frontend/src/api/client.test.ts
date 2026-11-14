import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('API origin', () => {
  it('uses the same origin in production without an override', async () => {
    vi.stubEnv('VITE_API_URL', undefined)
    vi.stubEnv('PROD', true)
    expect((await import('./client')).API_URL).toBe('')
  })

  it('uses the local API in development', async () => {
    vi.stubEnv('VITE_API_URL', undefined)
    vi.stubEnv('PROD', false)
    expect((await import('./client')).API_URL).toBe('http://localhost:8000')
  })

  it('keeps an explicit backend URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/')
    vi.stubEnv('PROD', true)
    expect((await import('./client')).API_URL).toBe('https://api.example.com')
  })

  it('allows an explicit same-origin URL during development', async () => {
    vi.stubEnv('VITE_API_URL', '')
    vi.stubEnv('PROD', false)
    expect((await import('./client')).API_URL).toBe('')
  })
})
