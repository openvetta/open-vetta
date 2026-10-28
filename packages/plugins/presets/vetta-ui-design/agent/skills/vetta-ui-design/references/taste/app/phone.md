## The phone

A phone screen is not a desktop folded down; its composition comes from the
direction. What holds on every phone screen:

- The frame is the screen: no drawn bezel, notch, island or home indicator. Keep
  the bottom 34px free of controls.
- The status bar is the engine's preset, never drawn: `import { StatusBar } from
  "@vetta/ios"` and render `<StatusBar variant="island" tone="dark" />` as the
  first child of the frame. `variant` is the design's `statusBar` setting in
  `vetd_status` (`vetd_create` returns it too). With no word from the user it is
  `island`; the user's words pick it otherwise — a notch is `notch`, a status
  bar with neither notch nor island is `flat`, no status bar is `none`, and then
  you draw nothing and reserve nothing. `tone="dark"` puts black glyphs on a
  light screen, `tone="light"` white ones on a dark screen.
- The status bar takes its own safe-area height at the top of the frame: 59px
  for `island`, 47px for `notch` and `flat`. Keep every piece of text and every
  control below it. A picture or colour field that runs under the bar uses
  `<StatusBar overlay />` instead, which floats and takes no space — but then
  start the content at that same height yourself.
- 44px touch targets, 16-24px side margins, body 15-17px, nothing under 11px.
- One primary action per screen, in thumb reach (the lower half) unless the
  content needs it elsewhere.
- Navigation earns its place: a tab bar only for three to five peer destinations
  people switch between; otherwise a back arrow and a title, or nothing.

What phones do well, as material rather than a template: a full-bleed picture or
colour field as the first screen, one very large figure, a sheet that slides over
the content, horizontal shelves of covers, a bar pinned to the bottom with the
one action, a persistent mini-player or order summary.

When the screen holds work-tool data: tables become two-line rows (identity and
the key number on line 1, the rest in 13px grey on line 2), KPIs a two-column
grid with an even count, charts full width at 160-200px with 3-4 x labels.
