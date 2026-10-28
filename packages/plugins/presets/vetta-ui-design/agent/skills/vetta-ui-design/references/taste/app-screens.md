# App screens

Read when the product type is `desktop` or `mobile`: dashboards, admin and back
office, analytics, settings and billing, inboxes and queues, wallets, builders,
the detail page of one object. A product page that shows its interface is a
landing page; the interface fragments on it follow this file for their insides.

Numbers are from taste-skill v2's study of 23 real product screens (see
`UPSTREAM.md`); **house rule** marks what goes past it. This file holds what
every screen needs. The app sheet (`vetd_direction`) holds the direction you
proposed — its idea, tokens, type and layout — and ends with the reference
parts. Without a sheet, read the parts you need from `app/`:
`shell`, `kpis`, `charts`, `tables`, `forms`, `values` (type and colour), `phone`, `navigation` (the phone bar).

## What separates real screens from generated ones

The study behind these numbers was of work tools. A customer-facing app —
ordering, media, banking, travel — keeps the discipline (honest data, one
question per screen, colour with a job) but not the restraint: its content
(pictures, food, music, places, money) leads, and colour and type may carry it
at area scale. For those apps read `app-screens-content.md` beside this file; it
replaces the numbers below that describe restraint (colour share, no shadow,
KPI sizes, 2px chart lines) and keeps everything about honesty and alignment.

1. **Colour goes on data, not chrome.** The median screen has about 3% coloured
   pixels; 12 of 23 have no filled primary button at all.
2. **KPIs are type, not tiles.** No icon in a coloured circle, no sparkline.
3. **Surfaces are flat.** A 1px line or one tone step, no shadow at rest.
4. **No hero header.** The title is a 24px noun.
5. **Charts carry almost no chrome.** One series, no legend, 3-5 faint gridlines.
6. **Navigation recedes.** A neutral grey pill or a change of text colour.
7. **Tables are rules and alignment.** No zebra, no header band, numbers right.
8. **Data states are honest.** Zeros print as zeros, missing values as a dash.

Taking the template away is half the job. In the first blind round, clean, quiet,
correct screens lost to richer ones: the first screen was thin, the product had no
name, restraint hid meaning, there was nothing to do. Quiet is the start, not the
goal. **Give the product a face**:

- the sheet's idea, visible on the first screen (a ground from the product's
  world, a figure face with character, the brand hue on the main data element);
- the product's mark and name at the top of the shell, and the scope (workspace,
  team, account) as a switcher or breadcrumb;
- **one element only this product has**, built from its own things — an energy
  home's power flow, a bakery's sell-out strip, a leave planner's cover against
  the minimum;
- the one chart hue on the main data element — a screen whose only hue is a delta
  reads as a kit;
- people as themselves (a stable initial and a pale tint of their own hue), and
  words of the trade in labels ("Waiting on the customer", never "Items").

## The run

1. **Inventory the data and the jobs** in 8-12 lines: the objects and their
   fields with units, realistic magnitudes (a new account has 1, 6 or 9 of
   something), who opens the screen and how often, the jobs they do next and
   which comes up most, the product's own things.
2. **Write the data first**, in `components/data.ts`, and render every block from
   it. Totals are computed from the rows, never typed separately; a fact shown
   twice is one variable; deltas are the difference of the two values as
   displayed; every relative figure names its baseline ("+5 on the usual
   Monday"). No lorem, Acme, John Doe, vanity totals or growth on a week-old
   account.
3. **Name the screen's one question** ("Which deploy broke?") and its **one
   finding** in today's data ("the 23:28 deploy doubled the error rate"). The
   question decides what is biggest — the largest block and the largest figure
   answer it — and what is left out. The finding goes where it is read first,
   under the title or the headline figure, next to the action it drives.
4. **List the blocks as answers to the next questions**, one line each; a block
   with no question is deleted. That is how you avoid KPI row, big chart, two
   small charts, table. Do not rebuild a famous screen of the same kind; take the
   structure from the product's own things.
5. **Three tested checks**: every block the brief names shows its header and
   first rows on the first screen (headline block about 200-360px tall, lists
   capped at 4-6 rows with "View all"); the most frequent job is one click away,
   its control where the answer shows; the evidence sits beside the answer (the
   spike annotated with its cause).
6. **Build the shell, then the data, then the states** (empty, zero, loading,
   error; hover, selected, focus, disabled). Do the grid arithmetic and write the
   sum in a comment — `3 × 372 + 2 × 17 = 1150`.

Motion is feedback only: press, hover, focus, a menu opening. Nothing performs an
entrance.

## Canvas and title

- Fluid with 24-40px side padding, or a centred 1100-1250px column. Title 20-36px
  below the canvas top. **One gap value** horizontally and vertically.
- **One left edge, one right edge**: the title, card titles, numbers and charts
  start on one line, and the cards end on the canvas edge. The grid's sum closes.
- **Dead space from a grid that does not fit the data** is the commonest failure:
  four KPIs in three columns, one card alone beside 800px of nothing. Choose the
  column count from the item count; let a lone card span.
- **Cards that share a row share a bottom edge.** Balance by content first; let a
  card keep its own height (`items-start`) rather than stretch over a blank band.
  Only an action or a total may sit at a stretched card's foot.
- **Narrow blocks do not span the canvas**: a five-column table or a six-row list
  runs to about 760px and pairs with the next block.
- **One h1**: a noun at 24px/600 ("Overview", the object's name), not a greeting
  (a greeting suits a personal home only, never with an emoji). An optional
  14-16px grey line about the data — the finding or the period — never about the
  interface. Actions right of it only when real; one primary per screen, usually
  near-black.
- Date range at page level or per card, never both. Underline tabs on a full-width
  1px rule, a 2px indicator. Controls in a row share one height (32 or 36px).

## Density

- Sparse (6-25 data points: homes, settings): padding 20-24px, rows 56-92px.
  Medium (25-50: overviews, lists): rows 44-56px. Dense (~120: monitoring): 13px
  body, 28-42px rows, framed with generous air.
- Density is row pitch, padding and type size moved together. Placed space reads as
  calm; leftover space — a grid that does not fit, a stretched card — reads as
  unfinished.

## States

- An empty section keeps its frame and header plus one sentence across the block,
  or fills with reference data ("Nothing has sold out yet today" over last
  Sunday's times). An empty chart draws its zero line.
- First run: keep the frame and title; the first action where the data will
  appear, setup progress at its true percentage.
- Loading (house rule): the final layout with flat grey bars at each value's real
  size, no shimmer, no layout shift. Error (house rule): inside the failed block,
  one sentence with what failed and when the data was last good, and a Retry text
  button.
- Red is a signal, not a texture: one red mark per object at most.

## What app screens may do that pages may not

| Allowed | Limit |
| --- | --- |
| 1px borders on cards, panels, tables, controls | About 1.1-1.3:1 against the ground; controls one step stronger |
| Small labels above values | 12-14px sentence case at 4.5:1; meta 11-12px; nothing under 11px; at most one tracked uppercase label per screen |
| Rows of identical cards | Peer objects only, 3-6 across, no orphan, no icon on top |
| Monospace | IDs and code, or every figure as the direction's decision |
| Pills | Inside rows and beside a value, never above a heading |
| Index numbers | Only as data: a rank, a node number |
| Shadows | On what floats; a resting card at most a small blur under 8% black |
| A gradient | Only as an area fade under one line chart |

## Tells of generated dashboards

| Tell | Instead |
| --- | --- |
| Navy or tinted sidebar, coloured active pill with a left bar | Sidebar on the page ground, a neutral grey pill |
| "Welcome back, Alex 👋" | A noun title at 24/600 |
| Four KPI cards with an icon in a tinted circle, a green "+12.5%" and a sparkline each | One divided container, label over value, deltas in words where they matter |
| KPI values at 36-48px, bold, in the brand colour | 24-30px at 400-600 in ink |
| Gradient area chart, smoothed spline, a dot on every point | A 2px straight line, no fill, no markers |
| Rainbow palette, a hue per bar | One hue per chart, on the main data |
| Fat donut with slice labels | A thin ring, the legend as a table with values |
| Cards with a 1px border and a large soft shadow | A border or a tone step, no shadow |
| Zebra table under uppercase tracked headers, a chip, avatar and kebab on every row | 12px grey headers, rules and alignment, one status mark |
| Saturated status chips with white text | Pale tints with dark text of the same hue |
| The accent on every button, tab and link | Near-black primary; the accent on data |
| A top bar with search, a bell and an avatar, mostly empty | No top bar, or one that holds something real |
| Geist or Inter on #f8f8f8, white 12px cards, no hue on the data | The sheet's type and one element only this product has |
| An illustration and "No data yet" in an empty chart | The zero line and one sentence |

A screen with every tell removed and nothing in their place is a tidy template.
What fills the space is the product: its own data at real size, the one question
answered by the biggest block, and a grid whose sums close.
