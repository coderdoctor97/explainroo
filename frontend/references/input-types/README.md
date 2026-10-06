# Input type references

## MCP access

Both requested MCP endpoints were attempted before implementation. Primary
and related checklist-rule requests failed at TLS connection time. See
[mcp-status.json](mcp-status.json). No exact rule wording or MCP verification
result was available. The audit applies the user's supplied criteria.

## GitHub searches and inspected examples

The three exact supplied searches returned zero results through `gh api
search/code`; see [search-results.json](search-results.json). Star filtering
is a repository-search feature, not a reliable code-search qualifier, so
focused repository queries were used instead:

- `repo:mdn/learning-area "type=\"email\""`
  - [First HTML form](https://github.com/mdn/learning-area/blob/d55e1c2e3ff401519811b64e5b2a7d3643b43d0f/html/forms/your-first-HTML-form/first-form.html)
  - [Postcard form](https://github.com/mdn/learning-area/blob/d55e1c2e3ff401519811b64e5b2a7d3643b43d0f/html/forms/postcard-example/index.html)
  - [Styled first form](https://github.com/mdn/learning-area/blob/d55e1c2e3ff401519811b64e5b2a7d3643b43d0f/html/forms/your-first-HTML-form/first-form-styled.html)
- `repo:mui/material-ui "autoComplete=\"email\""`
  - [Sign-in example](https://github.com/mui/material-ui/blob/8b9993c97f3357497806dde7b4aab34e6b198710/docs/src/pages/premium-themes/onepirate/SignIn.js)
  - [Forgot-password example](https://github.com/mui/material-ui/blob/8b9993c97f3357497806dde7b4aab34e6b198710/docs/src/pages/premium-themes/onepirate/ForgotPassword.js)
- `repo:react-hook-form/react-hook-form "type=\"number\""`
  - [useFormState example](https://github.com/react-hook-form/react-hook-form/blob/36e53296193eb98fc8ffe9db2165cf53ceb62b8e/app/src/useFormState.tsx)
  - [Basic form example](https://github.com/react-hook-form/react-hook-form/blob/36e53296193eb98fc8ffe9db2165cf53ceb62b8e/app/src/basic.tsx)

The first MDN form, MUI sign-in, and React Hook Form basic example were
retrieved and inspected. Short excerpts:

```html
<!-- MDN: a visible label and email-specific type -->
<label for="mail">E-mail:</label>
<input type="email" id="mail" name="user_mail" />
```

```jsx
// MUI sign-in password Field includes these props:
autoComplete="current-password"
label="Password"
type="password"
```

```jsx
// React Hook Form: framework validation complements the native number type.
<input type="number" {...register('min', { min: 10 })} placeholder="min" />
```

These examples are references, not blanket endorsements: the MUI email Field
uses autocomplete but does not explicitly declare type in the inspected
markup, and framework `min` rules do not necessarily create an HTML `min`
attribute. No library or reference code was added to the product.

## Field patterns for future forms

These are implementation guidance, not retrieved MCP wording. None of the
email/phone/URL/date/password/search fields currently exists in Studio.

| Purpose | Type | Optional companions and rationale |
| --- | --- | --- |
| Email | `email` | `autoComplete="email"`; native syntax validation and email-oriented keyboard. |
| Phone | `tel` | `autoComplete="tel"`; phone-oriented keyboard, **no** built-in phone-format validation. Avoid patterns that reject international formats. |
| Website | `url` | `autoComplete="url"` when collecting the user's website; native URL validation. |
| Quantity | `number` | Domain-appropriate `min`, `max`, `step`; use decimal inputMode only where useful. Not for identifiers or formatted currency. |
| Numeric identifier | `text` | `inputMode="numeric"`, and a pattern only if the actual allowed format is known; preserves leading zeroes. |
| Date | `date` | Native picker; bounds where required. Use `month` or `week` only when those are the actual units. |
| Password | `password` | `autoComplete="current-password"` for sign-in or `new-password` for creation. |
| Search query | `search` | `enterKeyHint="search"` if appropriate; do not apply to keyword creation. |
| General content | `text` | No unrelated personal-data autocomplete token; do not restrict scripts or characters without a product requirement. |

`required` is a product constraint, not an accessibility decoration. Native
validation is not server-side validation. Device keyboards, autofill behavior,
and localized validation bubbles must be tested in actual target browsers;
jsdom or desktop device emulation cannot prove them.
