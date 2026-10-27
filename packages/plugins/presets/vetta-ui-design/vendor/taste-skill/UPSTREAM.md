# Upstream: taste-skill

The JSON files in `library/` are copied **verbatim** from **taste-skill v2**
(`design-taste-frontend`), the research library its `draw.mjs` deals art
directions from.

- Source: https://github.com/Leonxlnx/taste-skill (`skills/taste-skill/library/`)
- Commit: `12af471f627f866411b4bd785b19646d3672784c` (2.1.5, 2026-10-25)
- License: MIT, see `LICENSE` in this directory

## Never edit these files

Every adaptation to `.vetd` frames lives in `src/direction/`, not here:

| Concern | Where |
| --- | --- |
| Typefaces that exist on fontsource (Fontshare-only faces are dropped) | `src/direction/fontsource.ts` |
| Dropping motion, scroll scenes, photographs and studied-site references | `src/direction/library.ts` |
| Dealing landing pages (ported from `scripts/draw.mjs`) | `src/direction/deal.ts` |
| The sheet the agent reads, in theme.css tokens and fontsource imports | `src/direction/sheet.ts` |
| Searching `photos.json` (Unsplash photographs served by picsum.photos) | `src/assets/sources.ts` |

Keeping the data untouched is what lets an upstream release be taken by copying
files, without merging anything. `test/direction-library.test.ts` fails when an
update breaks an assumption the adapters make.

## What was not copied

- `app.json`: its seven app styles, shells and screen patterns were measured on
  desktop work tools, and dealing them made every app — ordering, banking,
  media — look like the same back office. App directions are proposed by the
  agent and checked by `src/direction/proposal.ts`; the palettes and type
  pairings here are offered to it as raw material.
- `sites.json`: studied-site notes, only cited in the upstream sheet.
- `motions.json`, `scenes.json`: frames are fixed-size and static.
- `references/*.md` and `SKILL.md`: their rules were rewritten once for frames in
  the skill (`agent/skills/vetta-ui-design/`). When an upstream changelog entry
  changes a rule, port it there by hand.

## Syncing

1. Clone the upstream repository at the new commit.
2. Copy `skills/taste-skill/library/{directions,heroes,sections,palettes,type,photos}.json`
   over the files in `library/`, and update the commit above.
3. Run the plugin tests. A typeface the upstream newly uses fails the library test
   until someone checks npm for `@fontsource(-variable)/<slug>` and lists it in
   `src/direction/fontsource.ts`, as installable or as unavailable.
