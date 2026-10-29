## The watch

An Apple Watch screen (watchOS 26) is read in a glance and used with a fingertip and
the Digital Crown. It is not a small phone: one idea per screen, one figure large,
almost nothing to read. Numbers below marked (Apple) come from Apple's Human
Interface Guidelines for watchOS; the rest are house rules.

**The frame**
- Size from `vetd_sizes` (`watch 46`: 208x248, `watch 42`: 187x223) — or
  `product: "watch"`, which is 208x248. Declare the preset's `radius` in the frame
  meta (`export const frame = { width, height, title, radius }`).
- The frame is the screen: no drawn bezel, crown, side button or band. There is no
  status bar — never render `@vetta/ios` `StatusBar` here and ignore the design's
  `statusBar` setting. The system time sits top-right (see Navigation).
- Do not rely on `backdrop-filter`: frames with a screen-sized corner radius run
  with it switched off. Make glass with a translucent fill instead (below).

**Ground and colour**
- The ground is pure black, `#000000`, unless the user asked for another
  background. The display is black and the ground melts into the bezel. No light
  mode, no off-black `#111`.
- Cards and rows are dark greys made of white at 12-18% over the black, or a
  tinted fill of the accent at the same strength. No borders, no shadows.
- One accent hue. Colour a full-screen background only when it says something (a
  ring colour, a timer state), and not in a view that stays on screen for long, such
  as a workout or a player (Apple).

**Type**
- System sans only: `font-family: -apple-system, "SF Pro Text", system-ui,
  sans-serif` (SF Compact is the watch's face but is not available in the
  browser; this is the nearest). `ui-rounded, "SF Pro Rounded"` for a big figure
  if the direction wants a softer voice. Apple also allows a serif (NY) on watchOS;
  here, **no serif** — not for the display face either — unless the user asked for
  one. Avoid slab and other serif classes the same way.
- Sizes are Apple's default (Large) text styles, points = px: Large Title 36,
  Title 1 34, Title 2 28, Title 3 19, Headline 16 semibold, Body 16, Caption 1 15,
  Caption 2 14, Footnote 1 13, Footnote 2 12. Leading is size + 2.5. Default text is
  16 and nothing goes under 12 (Apple).
- Weights Regular, Medium, Semibold or Bold. Never Light, Thin or Ultralight (Apple).
- The one big figure may go larger than Large Title (48-64) when it is the screen.

**Navigation (watchOS 26)**
- A pushed screen has a **round back button at top-left**: a chevron.left glyph in a
  circle about 40px across, no label. A second round button may sit top-right for
  one contextual action. They are Liquid Glass: a translucent fill (white 16-22%) with
  a 1px inner highlight (white 20%), no blur needed.
- The **title** is a Headline-size noun, in white or the accent, to the right of the
  back button; the **time** (`9:41`, Headline-size) is top-right. The system moves
  the title and time to make room for the corner buttons (Apple), so with a
  trailing button the time shifts left of it.
- Content scrolls **under** the corner buttons: let the first row start below them
  (top padding about 44px), and fade the content out under the buttons rather than
  drawing a bar behind them.
- No bottom tab bar. Tab views are page dots plus the Crown (Apple): at most two or
  three peer pages, shown as a small dot row near the bottom, and keep the hierarchy
  shallow. Primary navigation is a list of rows that push.

**Controls**
- Inline buttons are capsules with a material fill that contrasts with the ground
  (Apple). A primary action is a full-width capsule; stacked buttons share one
  height (Apple).
- At most three buttons with glyphs, or two with text, in a row; text buttons span
  the full width of the screen when they can (Apple).
- Touch targets at least 44px tall; the whole row is the target, not its icon.

**Layout**
- One column. The first screen answers one question with one figure, one line of
  context and at most one action. Three pieces of information is already a lot.
- Edge to edge is fine for fills and pictures, but text stays at least 12px inside the
  display edge and 16px inside the rounded corners; shapes near a corner are
  concentric with the screen radius.
- Lists are short; show the most relevant rows and a way to see more (Apple). A
  detail view that has to scroll is still fine, but short details let people swipe
  between them.
- Scroll vertically only. The Crown scrolls.

**Before you call a watch screen done:** black ground; no serif anywhere; text at
least 12px and no light weights; a back button and time where the navigation says;
no tab bar, no status bar, no drawn hardware; and it reads in one second.
