# Semantic HTML references

Searches run through authenticated `gh api search/code` on 2026-10-06.
The requested broad queries returned mostly reading lists rather than usable
component implementations; these are discovery results, not endorsements.
No code was copied from those results.

## Top three results per requested query

### `semantic html layout example`
- https://github.com/ty4z2008/Qix/blob/91cd7835e8e2edd38e69d771bbb531271abff502/dl.md
- https://github.com/ty4z2008/Qix/blob/91cd7835e8e2edd38e69d771bbb531271abff502/dl2.md
- https://github.com/Zeal29/full-stack-interview-questions/blob/6aa56feab64541f7d55a31526750aa16676609cd/HTML.md

### `html5 semantic elements accessibility`
- https://github.com/sindresorhus/awesome/blob/bc98e517ddca672f55f9857d714fc3ea3c3540b2/readme.md
- https://github.com/mdo/code-guide/blob/6918226689cb46f6888244f1ee17389b0bd592be/index.md
- https://github.com/Mohan070296/Interview_questions/blob/3ff4531f5581e474ba4821b764c2673058440270/HTML5.md

### `react component semantic html`
- https://github.com/kallaway/100-days-kallaway-log/blob/56addb5af97430c0d2b05e6ae3c5a5b7a09c0cc5/R3.md
- https://github.com/regl-project/regl/blob/581f8071182a8127d37a0cd1d3b035d7e5fef074/API.md
- https://github.com/open-workflow-specification/specification/blob/fe69b1b8090601a1b73555e9bd576a7590a131e1/dsl.md

### `vue template semantic html`
- https://github.com/sindresorhus/awesome/blob/bc98e517ddca672f55f9857d714fc3ea3c3540b2/readme.md
- https://github.com/viatsko/awesome-vscode/blob/9c3bf848287d3967a744e7c057ea49ec9e89b396/README.md
- https://github.com/moklick/frontend-stuff/blob/512267e441f5eae5269130db1cef8f3ceff50b72/README.md

### `angular semantic html layout`
- https://github.com/sindresorhus/awesome/blob/bc98e517ddca672f55f9857d714fc3ea3c3540b2/readme.md
- https://github.com/moklick/frontend-stuff/blob/512267e441f5eae5269130db1cef8f3ceff50b72/README.md
- https://github.com/joelparkerhenderson/git-commit-message/blob/3782ac665fee96d593e58d0d1672f2d9b8e9f8f7/README.md

## Focused markup reference inspected

[MDN document and website structure example](https://github.com/mdn/learning-area/blob/main/html/introduction-to-html/document_and_website_structure/index.html)
was retrieved through the GitHub contents API. Short excerpt:

```html
<header>
  <h1>Header</h1>
</header>
```

Its full example includes navigation, a main article with headed subsections,
an aside and footer. Here, the Studio is a tool rather than an article, so no
`article` is added merely to satisfy a tag inventory. Existing native elements
keep their implicit roles; ARIA supplies names, not redundant role attributes.
The MDN example's unnamed nav is not copied: Studio's nav remains named `steps`.

## Checklist service

See `checklist-status.json`. No exact rule text, related-rule export, or remote
verification response was available. Requirements and tests are based on the
user's supplied prompt and the application's actual structure, not invented
MCP wording.
