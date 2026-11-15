import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Where the application is served from.
 *
 * `/` everywhere except the published demo, which is a GitHub Pages *project* site and
 * therefore lives under `/<repository>/`. Only the `pages` mode builds for that, so
 * `npm run dev:mock` stays at the root and nothing about ordinary development changes.
 *
 * Read from the environment rather than written here, because the repository's name is not
 * this file's business and a renamed repository should not need a code change: the workflow
 * passes it in.
 */
const baseFor = (mode: string) =>
  mode === 'pages' ? (process.env.PAGES_BASE ?? '/') : '/'

export default defineConfig(({ mode }) => ({
  base: baseFor(mode),

  plugins: [react(), tailwindcss()],

  server: {
    // Development is same-origin: the proxy means CORS is not exercised here. The API has a
    // CORS policy anyway (issue 01), so it is honestly consumable from a browser on another
    // origin rather than only working behind this proxy.
    proxy: {
      '/api': { target: 'http://localhost:5056' },
      '/openapi': { target: 'http://localhost:5056' },
    },
  },

  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Deliberately not the salon's timezone, and deliberately a half-hour offset with no DST.
    // A wall-clock test that passes only because the machine agrees with the server is worse
    // than no test: ADR-0001 keeps times as local wall-clock with no offset on the wire, and
    // the whole job of wallClock.ts is to carry them without a timezone ever being applied.
    // Asia/Kolkata (UTC+05:30) breaks naive arithmetic harder than a whole-hour offset would.
    env: { TZ: 'Asia/Kolkata' },
  },
}))
