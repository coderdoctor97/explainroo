# Script Loading Audit — html/defer-async

**Rule**: [Load scripts with defer, async, or type=module](https://frontendchecklist.io/rules/html/defer-async)  
**Date**: 2026-10-06  
**Scope**: `frontend/` subfolder (all changes applied strictly to the frontend subfolder)

## Summary

All `<script>` tags that reference external files in the frontend already comply
with the rule. No changes to existing script tags were required.

## Findings

### HTML entry points

| File | Script tag | Attribute | Status |
|------|-----------|-----------|--------|
| `frontend/index.html` | `<script type="module" src="/src/main.tsx">` | `type="module"` | ✅ OK |

### Engine HTML files (checked for reference)

| File | Script tag | Attribute | Status |
|------|-----------|-----------|--------|
| `engine/frame.html` | `<script type="module">` (inline) | `type="module"` | ✅ OK — inline, no src |
| `engine/studio.html` | `<script type="module">` (inline) | `type="module"` | ✅ OK — inline, no src |

### Component and template files

| File | Script tags with src | Status |
|------|---------------------|--------|
| `frontend/src/App.tsx` | 0 | ✅ OK |
| `frontend/src/main.tsx` | 0 | ✅ OK |
| `frontend/src/components/Frame.tsx` | 0 | ✅ OK |
| `frontend/src/components/Readout.tsx` | 0 | ✅ OK |
| `frontend/src/components/Transport.tsx` | 0 | ✅ OK |
| `frontend/src/components/ui.tsx` | 0 | ✅ OK |
| `frontend/src/stages/Look.tsx` | 0 | ✅ OK |
| `frontend/src/stages/Plan.tsx` | 0 | ✅ OK |
| `frontend/src/stages/Render.tsx` | 0 | ✅ OK |
| `frontend/src/stages/Sources.tsx` | 0 | ✅ OK |

No component or template files inject `<script src>` tags directly.

### Build tooling

| Tool | Config file | Script injection |
|------|------------|-----------------|
| Vite | `vite.config.ts` | Vite adds `type="module"` to all output scripts by default — ES module output is the standard for modern builds |

No Webpack, Rollup, or other build tooling that would need explicit `defer`/`async` configuration.

### Dev server script injection

The Vite dev server injects two scripts into the served HTML:
- `<script type="module">` for `/@react-refresh` — ✅ non-blocking
- `<script type="module" src="/@vite/client">` — ✅ non-blocking

Both carry `type="module"`, so they are deferred by default.

## Conclusion

**1 external script tag found across the frontend.** It already uses `type="module"`, which is
equivalent to `defer` (module scripts are always deferred by the HTML specification).

No blocking scripts, no changes needed. A guard script (`check-defer-async.mjs`)
has been added to enforce this going forward, and is wired into `npm run lint:html`
and `npm run test:ui`.
