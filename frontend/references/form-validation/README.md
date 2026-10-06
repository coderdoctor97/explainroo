# Accessible form validation references

Searches were run through authenticated `gh api` after the requested GitHub MCP
failed with `curl (35): SSL_ERROR_SYSCALL`. Raw search results are in
`search-results.json`; discovery results are not automatically quality endorsements.

Two focused references were retrieved and inspected:

1. [GOV.UK error summary](https://github.com/alphagov/govuk-frontend/blob/283cc58ead97f3e3379199976709713914e00b05/packages/govuk-frontend/src/govuk/components/error-summary/error-summary.mjs)
   focuses the summary on initialization, handles links explicitly, and focuses
   the target input after locating its associated label. Pattern adopted:
   programmatic focus on submission failure and real fragment links with focus
   handling. No source was copied wholesale.
2. [React Aria TextField tests](https://github.com/adobe/react-spectrum/blob/99e610236887da619ad9d54a1cd87983166c043d/packages/react-aria-components/test/TextField.test.js)
   check required state, error descriptions resolving to actual elements,
   validity, focus, correction and keyboard interaction. Pattern adopted:
   assert relationships and interactions rather than only snapshot strings.
   Their native required approach does not always add aria-required; this task
   explicitly requests both, so our required fields expose both.

Existing local patterns: React useId for unique IDs, native labels and number
constraints, CSS focus-visible styling, Node test runner, jsdom, real React UI
integration tests and axe-core. The new checks use these rather than introducing
a second test framework or form library.

No reference is treated as proof of WCAG conformance. Automated tests cannot
prove screen-reader announcements, actual browser tab order or visual contrast.
