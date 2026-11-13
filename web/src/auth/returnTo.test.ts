import { describe, expect, it } from 'vitest'

import { loginPathFor, returnToFrom } from './returnTo'

describe('being sent to login', () => {
  it('carries where you were, path and query together', () => {
    expect(loginPathFor({ pathname: '/admin/bookings', search: '?date=2026-11-20' })).toBe(
      '/login?returnTo=%2Fadmin%2Fbookings%3Fdate%3D2026-11-20',
    )
  })

  it('does not ask to be returned to login itself', () => {
    expect(loginPathFor({ pathname: '/login', search: '' })).toBe('/login')
    expect(loginPathFor({ pathname: '/register', search: '' })).toBe('/login')
  })
})

describe('being returned afterwards', () => {
  it('goes back to the path that was asked for', () => {
    expect(returnToFrom('?returnTo=%2Fbook%3FserviceId%3D3')).toBe('/book?serviceId=3')
  })

  it('falls back to the menu when nothing was asked for', () => {
    expect(returnToFrom('')).toBe('/')
    expect(returnToFrom('?returnTo=')).toBe('/')
  })

  // `isInternalPath` in ./returnTo.ts says why each of these has to be refused.
  it('refuses to leave the application', () => {
    expect(returnToFrom('?returnTo=https%3A%2F%2Fevil.test%2Fpay')).toBe('/')
    expect(returnToFrom('?returnTo=%2F%2Fevil.test%2Fpay')).toBe('/')
    expect(returnToFrom('?returnTo=%2F%5Cevil.test')).toBe('/')
    expect(returnToFrom('?returnTo=javascript%3Aalert(1)')).toBe('/')
    expect(returnToFrom('?returnTo=book')).toBe('/')
  })
})
