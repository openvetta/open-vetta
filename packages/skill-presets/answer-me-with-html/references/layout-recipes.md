# Main-conversation layout recipes

Start from [answer-template.html](../assets/answer-template.html). Read it as text, adapt the HTML and CSS directly, and keep its complete MIT license comment. There is no compiler, CLI, custom DSL, external runtime, or dependency installation step.

## Choose a shape

| User need | Shape | Essential content |
| --- | --- | --- |
| Compare options | `am-sheet` with `am-grid` panels | Recommendation, shared comparison criteria, trade-offs, uncertainty |
| Explain a concept | `am-doc` with `am-doc-body` | Direct explanation, ordered concepts, one concrete example |
| Present a report | Doc or a compact sheet | Finding, evidence and time period, limitations, next step |
| Describe a plan | Doc with `am-timeline--v` | Goal, ordered milestones, dependencies, unresolved decisions |
| Answer a simple question | Concise Markdown | The answer, without decorative panels |

The template demonstrates multiple shapes so they can be reused independently. Do not include every shape in every answer. To use the doc layout, change the main class from `am-sheet` to `am-doc` and the inner `am-grid` to `am-doc-body`. Both remain single-column on narrow cards. Do not add upstream's sticky table of contents or toolbar.

## Components

- Conclusion or caution: `am-callout`, optional `am-callout--ok`, `--warn`, or `--err`, with `role="note"`, a meaningful title, and text explaining the consequence. Never use color alone for status
- Metadata: `dl.am-kv`, with `div.am-kv-cell` containing paired `dt` and `dd`. `am-kv-cell--wide` spans a full row. Preserve units, scope, and dates; omit unknown fields rather than inventing them
- Milestones: `ol.am-timeline.am-timeline--v`, then `li.am-tl-item` with time, decorative dot, title, and optional detail. `am-tl-item--hi` emphasizes the current or important step; explain what the emphasis means in words
- Comparison table: `div.am-table-wrap` containing a real `table` with `caption`, `thead`, `tbody`, and `th scope="col"` / `th scope="row"`. Keep only useful criteria. Let the table wrapper scroll rather than the entire answer
- Supporting detail: native `details` with a descriptive `summary`. Keyboard users must be able to open it. The recommendation, significant caveats, and evidence needed to assess it stay visible

## Narrow-card and accessibility checks

Design at 260px and 360px before adding columns. Give grids `minmax(0, 1fr)`, let long words wrap, and keep spacing modest. Prefer a vertical timeline. The template collapses key-value cells below 360px and uses one sheet column below 560px. A wide table alone may scroll horizontally. Do not clip prose or shrink text until it becomes unreadable.

Use one `h1`, ordered `h2`/`h3` sections, visible labels, adequate contrast, and explicit units/statuses. Set the answer language on `body` or `main`; use system fonts and no network resources. Preserve the template focus outline for `summary` and any native CSS-only selection controls. Avoid animation.

## Delivery and compatibility

Send the final HTML in a closed `html-preview` fence directly in the assistant's main reply. Vetta waits for a complete response and a closed Markdown fence, then offers Preview / Source / Copy in place. This is not HTML validation; make the markup valid before replying. Ordinary `html` fences are source-first with manual Preview.

No file creation, browser launch, or right-side activity panel is needed. Save a file only for an explicit artifact/export request. No scripts, event handlers, forms, links, URL-bearing attributes, remote assets, CSS imports/URLs, or nested documents belong inside the static preview. Place citations as verified Markdown links outside the fence.
