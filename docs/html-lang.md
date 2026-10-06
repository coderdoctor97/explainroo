# Document language

The English UI declares `<html lang="en">` in `frontend/index.html`,
`engine/studio.html`, and `engine/frame.html`. `en` is a BCP-47 language tag.
This lets screen readers select English pronunciation and helps translation
and search tools identify the language before JavaScript runs. Studio already
had this attribute; the engine documents now declare it too.

If localization is introduced, keep the root attribute in sync with the page's
UI locale, not the language of an uploaded transcript. No runtime dependency
or Helmet wrapper is necessary for these static HTML shells.

## Regression coverage

- `test/html-lang.test.js` parses all three real documents with jsdom and
  checks `document.documentElement.lang === 'en'` and `Intl.Locale` parsing.
- `frontend/server/uitest.mjs` now mounts the UI in the real Studio HTML and
  checks that rendering preserves the language attribute.
- `npm test`: 44 passed, one existing browser test skipped (no Chrome).
- `npm run lint:html` and `npm run build`: passed.
- `npm run test:ui`: 121/123 passed, including the language assertion. Both
  failures also occur with the unchanged baseline test: the generated script
  src-expression fixture and the video-without-controls fixture.

## Checklist and reference status

Requested rule: [Set the page lang attribute](https://frontendchecklist.io/rules/html/lang-attribute)
(`html/lang-attribute`). On 2026-10-06, a request to
`https://mcp.frontendchecklist.io` failed with `SSL_ERROR_SYSCALL`. The rule's
full wording, success criteria, and related-rule data could not be retrieved
or exported. No MCP pass is claimed; the criteria above come from the task,
not a verified rule export. Existing charset and viewport checks were retained.

GitHub reference inspected via `gh api`:
[Next.js localized root layout](https://github.com/vercel/next.js/blob/canary/examples/i18n-routing/app/%5Blang%5D/layout.tsx),
which uses `<html lang={params.lang}>`. This project has no UI locale config,
so static `en` is appropriate.

Browser/WAVE inspection and an actual-browser screenshot were not completed:
Chrome was unavailable and the Playwright browser download failed. For manual
verification, open Studio, inspect the root element in DevTools, and confirm
`document.documentElement.lang` returns `en`. Repeat with a served production
build. These local DOM tests do not substitute for MCP or screen-reader testing.
