import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderRoute, signedInAs } from '../test/renderRoute'

beforeEach(() => {
  sessionStorage.clear()
})

describe('a visitor with no session', () => {
  it('may read the menu', () => {
    renderRoute('/')

    expect(screen.getByRole('heading', { name: /the menu/i })).toBeInTheDocument()
  })

  it('is sent to sign in, and asked to be brought back, when pasting a client address', () => {
    const { currentPath } = renderRoute('/bookings')

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(currentPath()).toBe('/login?returnTo=%2Fbookings')
  })

  it('is sent to sign in when pasting an admin address, query string and all', () => {
    const { currentPath } = renderRoute('/admin/bookings?date=2026-11-20')

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    expect(currentPath()).toBe('/login?returnTo=%2Fadmin%2Fbookings%3Fdate%3D2026-11-20')
  })
})

describe('a visitor with no session, in the navigation', () => {
  it('is invited to book, but not offered bookings they cannot have', () => {
    renderRoute('/')

    // Book leads to the login page and `returnTo` brings them back, which is a better
    // invitation than hiding the thing the salon exists to do.
    expect(screen.getByRole('link', { name: /book/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my bookings/i })).not.toBeInTheDocument()
  })
})

describe('a client', () => {
  it('reaches their own bookings', () => {
    signedInAs('Client')

    renderRoute('/bookings')

    expect(screen.getByRole('heading', { name: /my bookings/i })).toBeInTheDocument()
  })

  /**
   * Refused in place, not redirected. A client who is signed in has nothing to gain from being
   * sent to a login page they have already satisfied, and a guard that did that would bounce
   * them between the two addresses with no explanation of why.
   */
  it('is refused an admin address plainly, and stays where they are', () => {
    signedInAs('Client')

    const { currentPath } = renderRoute('/admin/bookings')

    expect(screen.getByRole('heading', { name: /salon admins/i })).toBeInTheDocument()
    expect(currentPath()).toBe('/admin/bookings')
    expect(screen.queryByRole('heading', { name: /all bookings/i })).not.toBeInTheDocument()
  })

  it('is not offered the admin navigation', () => {
    signedInAs('Client')

    renderRoute('/')

    expect(screen.queryByRole('link', { name: /services/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my bookings/i })).toBeInTheDocument()
  })
})

describe('an admin', () => {
  it('reaches the admin addresses', () => {
    signedInAs('Admin')

    renderRoute('/admin/bookings')

    expect(screen.getByRole('heading', { name: /all bookings/i })).toBeInTheDocument()
  })

  /**
   * From `user.role` on the stored session, which came from `AuthResponse`. Nothing here
   * decodes the JWT to decide what to render.
   */
  it('is offered the catalogue, which a client never sees', () => {
    signedInAs('Admin')

    renderRoute('/admin/bookings')

    expect(screen.getByRole('link', { name: /services/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /stylists/i })).toBeInTheDocument()
  })
})

describe('a session that expired while the tab was closed', () => {
  it('counts for nothing, and costs no request to find out', () => {
    signedInAs('Client', '2020-01-01T00:00:00Z')

    const { currentPath } = renderRoute('/bookings')

    expect(currentPath()).toBe('/login?returnTo=%2Fbookings')
    expect(sessionStorage.getItem('salon.session')).toBeNull()
  })
})
