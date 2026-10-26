# Upstream

The files in this directory are adapted from **Hallmark**, a design skill that
targets the defaults every LLM falls back to.

- Source: https://github.com/Nutlope/hallmark (`skills/hallmark/`)
- Commit: `13ac0ec7e148655948100b6396439e481361d690`
- License: MIT (reproduced below)

## What was adapted

Hallmark emits standalone HTML + CSS marketing pages. Everything here was
rewritten for `.vetd` frames — fixed-size TSX, Tailwind v4 `@theme` tokens in
`theme.css`, fonts as installed `@fontsource` packages — and widened from landing
pages to the product types this skill covers (app screens, dashboards, slides,
posters).

| Here | From Hallmark |
| --- | --- |
| `directions.md` | `genres/*.md`, the tone step of SKILL.md |
| `color.md` | `color.md` |
| `typography.md` | `typography.md` (font catalogue narrowed to packages verified on fontsource) |
| `anti-patterns.md` | `anti-patterns.md` + the screenshot-visible gates of `slop-test.md` |
| `copy.md` | `copy.md`, plus Chinese-language equivalents |
| `whitespace.md` | not in Hallmark — written for this skill |

`app-screens.md` is not from Hallmark: it condenses `references/app-screens.md`
of taste-skill v2 (MIT, commit and license in `vendor/taste-skill/` at the plugin
root), rewritten for fixed-size frames — no inspector, no `charts.js`, no
responsive widths. It replaced the hand-written `app-density.md`.

Since the taste-skill integration (`vendor/taste-skill/` at the plugin root),
landing pages and app screens get their direction dealt by `vetd_direction`;
`directions.md` covers slides, posters and infographics only, and the former
`landing-structures.md` was removed in favour of the dealt hero and section
blueprints.

## What was deliberately left out

- The `audit` / `redesign` / `study` verbs. Style extraction already exists as
  design-resource packs in the Design sidebar.
- The three-question gate before building. This skill infers the direction and
  states it; it does not interview the user.
- CSS stamps, `.hallmark/log.json`, `tokens.css`, the preview block. The `.vetd`
  bundle already records the design; `theme.css` is the token file.
- Responsive breakpoint gates, motion and microinteraction recipes, hero video /
  Lottie / generated-image enrichment. Frames are fixed-size and mostly static.
- The 21 catalog themes. Named styles belong in design-resource packs the user
  picks, not in the prompt.

## Syncing

Diff upstream from the commit above; port rule changes by hand into the matching
file. Do not copy files over — they no longer share a format.

## License

MIT License

Copyright (c) 2026 Hallmark contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
