/**
 * Starts the demo salon in the browser.
 *
 * Imported only when `VITE_MOCK_API` is set — dynamically, from `main.tsx`, so none of
 * `src/mocks/` and none of MSW reaches an ordinary production bundle.
 */

import { setupWorker } from 'msw/browser'

import { ADMIN_EMAIL, ADMIN_PASSWORD, handlers, persist, restoreOrSeed } from './handlers'

export async function startDemoSalon(): Promise<void> {
  restoreOrSeed()

  const worker = setupWorker(...handlers)

  /*
   * Save after anything that changed the salon, in one place rather than at the end of every
   * handler that writes — a handler added later cannot forget to do it.
   *
   * Keyed on the method because every write in this API is a POST, PUT or DELETE and every
   * GET is a read. That is true of the real API too, and is not an accident: it is what makes
   * `GET` safe to retry, which TanStack Query relies on.
   */
  worker.events.on('response:mocked', ({ request }) => {
    if (request.method !== 'GET') persist()
  })

  await worker.start({
    // The service worker is served from the application's own origin, and Vite serves
    // `public/` at the root in dev and copies it into `dist/` for a build.
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },

    // Anything these handlers do not answer is a real request, and in this mode there is
    // nothing to answer it. Saying so is better than a silent failure the screens then have
    // to explain as the salon being unreachable.
    onUnhandledFrame: 'warn',
  })

  /* eslint-disable no-console */
  console.info(
    [
      'Demo mode: there is no API and no database. Every answer comes from `src/mocks/`,',
      'and the salon lives in this tab — a reload keeps it, closing the tab forgets it.',
      '',
      `Admin sign-in: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`,
      'Or register a client account — the form works, and chains a login as it does against',
      'the real API.',
    ].join('\n'),
  )
  /* eslint-enable no-console */
}
