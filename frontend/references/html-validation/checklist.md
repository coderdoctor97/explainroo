# Checklist connection record — 2026-10-06

Requested primary rule: https://frontendchecklist.io/rules/html/w3c-compliant

Attempted with `Accept: application/json`:
- https://mcp.frontendchecklist.io/rules/html/w3c-compliant
- https://mcp.frontendchecklist.io/rules?category=html

Also attempted GitHub MCP with `Accept: application/json, text/event-stream`:
- https://link.mcpmarket.com/earningbuddyv/github-chat/mcp

All three requests failed with curl (35), OpenSSL SSL_connect:
SSL_ERROR_SYSCALL. Authentication/discovery could not complete. The primary
rule description, related rules, official acceptance criteria and recommended
tools could not be retrieved. This is an attempt log, not an MCP response.

Fallback: the user-provided task requirements, the connected repository, and
authenticated GitHub CLI. High priority comes from the prompt. No remote
verification or exact-checklist-conformance claim is made.
