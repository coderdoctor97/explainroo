# Accessible form validation — checklist access record

Attempted on 2026-10-06, before repository inspection/implementation:

- GET https://mcp.frontendchecklist.io/rules/html/form-validation
- GET https://mcp.frontendchecklist.io/rules?category=html&query=form-labels,aria-attributes,live-region,keyboard-navigation
- Accept: application/json
- Both requests failed with curl (35): OpenSSL SSL_connect: SSL_ERROR_SYSCALL.

Requested reference: https://frontendchecklist.io/rules/html/form-validation

No full rule text, related rules, severity metadata, official acceptance criteria,
or remediation examples could be retrieved. This file is a local attempt record,
not a rule export or an MCP verification result. High priority is specified by
the user, not independently confirmed with the service.

## Working criteria (from the user's prompt, not verified MCP wording)

1. Give validated fields visible associated labels, appropriate native constraints,
   unique hint/error IDs, required indicators where applicable, and ARIA wiring.
2. Validate on blur and submit, not each keystroke; give specific actionable errors.
3. On invalid submission, show and focus a linked error summary; expose messages
   through live regions and allow keyboard users to focus each invalid field.
4. Handle client validation and API failures without losing entered values;
   preserve visible focus and provide non-color-only, high-contrast error feedback.
5. Test initial, invalid, corrected, successful, and server-error states plus
   accessibility. Report limits of jsdom, keyboard simulation and visual checks.
