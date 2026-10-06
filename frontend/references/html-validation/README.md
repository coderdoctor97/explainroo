# Validation references

Raw authenticated GitHub code searches are in `searches.json`. Three matching
examples were retrieved and inspected through the GitHub contents API:

1. [icco/resume workflow](https://github.com/icco/resume/blob/e4e3d6800f3883a4a74454e2d1e59fe12aa3e23b/.github/workflows/html-validate.yml)
   triggers HTML checks on pushes and PRs using a pinned community validator
   action. Pattern: a dedicated failing validation step. This is not an
   “official W3C GitHub Action.”
2. [Bootswatch CI](https://github.com/thomaspark/bootswatch/blob/bff83c63ea845c9cb535a3c16e41aef6826cfd05/.github/workflows/ci.yml)
   installs npm dependencies, runs tests, then `npm run htmllint` using vnu-jar.
   Pattern: install reproducibly, then use a repository-owned command. Nu
   requires Java, which is unavailable here.
3. [React app lint-staged config](https://github.com/donniean/react-app/blob/234b0685a045f2f061e5c99adc2c80cbb50ecb01/lint-staged.config.ts)
   routes `*.html` to `html-validate` separately from JSX/TSX linting. Pattern:
   validate HTML as HTML, not TypeScript source. In this project React output
   is also checked because validating only the empty root shell is insufficient.

No source was copied wholesale. The implementation uses pinned html-validate,
a standards preset, a local script, JSON artifacts and the existing React UI
runner. CI/pre-commit hooks remain outside the permitted frontend-only scope.
