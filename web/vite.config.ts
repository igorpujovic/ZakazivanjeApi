import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
})
