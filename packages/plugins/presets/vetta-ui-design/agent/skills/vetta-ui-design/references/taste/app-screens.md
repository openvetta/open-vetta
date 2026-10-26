# App screens

Read when the product type is `desktop` or `mobile`: dashboards, admin and back
office, analytics, settings and billing, inboxes and queues, wallets, builders,
the detail page of one object. A product page that shows its interface is a
landing page; the interface fragments on it follow this file for their insides.

Distilled from taste-skill v2's chapter on app screens (a study of 23 real
product screens, measured from their pixels, and four blind test rounds; see
`UPSTREAM.md`). Numbers are the study's; **house rule** marks what goes past it.
The dealt app sheet (`vetd_direction`) fixes the style's tokens, type, shell and
screen patterns; everything it does not fix comes from here.

## What separates real screens from generated ones

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

- one face from the sheet's list (a ground from the product's world, a figure
  face with character, the brand hue on the main data element), visible on the
  first screen;
- the product's mark and name at the top of the shell, and the scope (workspace,
  team, account) as a switcher or breadcrumb;
- **one element only this product has**, built from its own things — an energy
  home's power flow, a bakery's sell-out strip, a leave planner's cover against
  the minimum. The sheet lists the ones the brief names; otherwise invent one;
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

## Shell

| Shell | What it is |
| --- | --- |
| Open plane | Labelled sidebar on the page ground, nothing or one hairline between; no top bar |
| Tinted frame, white sheet | Sidebar and top bar on one tint (#f6f6f6-#f9fbfc); the page on a white sheet inset 8px, radius ~16, 1px edge, no shadow |
| Ruled T-frame | 210-240px sidebar and 64px top bar on one ground, divided by 1px rules (mostly dark) |
| Icon rail | Unlabelled 50-60px rail, 16px icons; only for five destinations or fewer |
| No sidebar | 46-48px top bar over a centred 1088-1208px column; reports and viewers |

- **Never a dark or saturated sidebar on a light canvas** (0 of 17).
- **Sidebar**: 224-240px; rows 32px on a 34px pitch; 16px outline icons; 14px
  labels at 400. Active item: a neutral grey pill (#e9e9e9-#ededed, radius ~8)
  on light, brightness alone on dark. Groups under 12-13px sentence-case grey
  labels. Counts only on queues that need action, with a clear noun.
- **Top bar** only when it holds something real (search, the switcher, the
  object's name); 44-51px, or 64px with a rule.
- **No floating button** unless it is the one primary action and covers nothing.

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

## KPIs and deltas

- Default: **one container split by 1px dividers** into equal columns, or no KPI
  row at all with each headline number in the card that explains it.
- 3-4 per row, matching the columns. Values 24-30px at 400-600 in ink, labels
  12-14px grey above them, units as a smaller grey suffix ("5 mins"). Nothing at
  48px. Bold for money only.
- **The answer figure leads**: 30-36px, at least 1.3× its siblings, and no other
  figure on the screen is larger.
- No icon, no sparkline, no tinted tile. A figure appears in one place.
- Deltas are optional, 12-14px, the window in words ("vs prior 30 days"). **Colour
  says good or bad, not up or down**: latency, cost and churn are better falling.
  Zero or undefined change is grey; from zero write "+4 (new)".

## Charts

| Question | Form |
| --- | --- |
| Moving over time? | One straight line, no fill or a flat ~14% tint, no point markers |
| How much per period? | Columns with square corners |
| Who ranks? | A sorted horizontal bar list |
| What share? | A thin ring (3-8px stroke) or a 100% bar, five parts at most |
| How far to target / how much of the plan used? | A track at the true ratio, both ends labelled; an overrun past the end in the negative colour |
| Who is away when? | People down the left, days across; each kind of booking its own mark |

- **One question, one series**; switch metrics with a control instead of
  overlaying lines. Plots 140-260px tall.
- Gridlines horizontal only, 3-5, 1px, about #e5e5e5; no y-axis line; 4-6 round y
  ticks above the maximum at 12px grey; 4-8 flat x labels on one even step. Never
  without a scale.
- One hue per chart, on the main data element; neutrals for the rest; one subject
  keeps one hue across the screen; four hues per screen at most.
- No legend for one series; otherwise dots with labels in the card header, every
  swatch the mark it explains.
- Annotate the event that matters (a 1px marker and a 12px label naming its
  cause); reference lines 1px dashed with the label at the end. A forecast is
  dashed after today.
- A flat series with one event gets two-thirds width, not the whole row. Few
  numbers: draw no chart. Draw simple charts with divs or inline SVG; install a
  chart library only for real axes and many series.

## Tables and lists

- Rows 44-48px (single line), 56-72px (two lines with media; line 2 one size
  smaller, grey, ~21px below). Overview lists show 2-5 rows and link out with
  "View all" and the total — no pagination on an overview.
- Header 12px grey sentence case, no fill band, at most one rule (the strongest
  line in the table). No zebra; row rules 1px, 3-7% darker than the surface, or
  none.
- **Numbers right-aligned in tabular figures**, fixed decimals per metric,
  separators, a sign on every change, no space after the currency sign. The
  identity column gets the most width and is never the one truncated.
- Only the identity and the key number in full ink; the rest grey. A missing value
  is a grey dash; a real zero is printed. The sign lives in the text, not in red.
- Status pills: pale tint with dark text of the same hue, 20px tall, 12px at 500,
  `nowrap`. One status mark per row.
- One row action at most (a kebab, or a ghost button in a fixed trailing column
  when the row needs doing). Selected row in a list that drives a detail pane
  takes the nav pill's fill.

## Forms and settings

- Label above the field, 14px/500, 8px gap; no placeholder as label. Inputs 38-40px,
  white with a 1px #e5e7eb border even on a grey panel. Toggles 28×16; the on colour
  semantic green or near-black, not the accent. Disabled controls stay legible and
  say why.
- Settings: each section a row — a ~450px label column (16/500 title, 14px grey
  description) beside a ~700px panel (#fafafa, radius 16, padding 16, no border).
  Sections split by a full-width rule with 32px around it. One view per area, one
  save model per view, destructive actions last in the negative colour. Show what
  the setting produces (the email as it will arrive) beside its control.
- Buttons 32-36px; one filled primary, a white bordered secondary, text tertiary.

## Type and colour

- **One grotesk**; a second face only with one job (a mono for IDs or every
  figure, a serif for one greeting). Title 18-32px, figures 16-40px. 4-6 sizes
  (12/14/16/24 is a clean scale), three weights, tabular figures on every number
  that is compared or updates. Sentence case; tracking 0.
- **Light**: white cards on an off-white ground, or grey panels on white. Lines in
  three steps: card edges ~#eaeaea, row rules ~#f2f2f2, control borders ~#d1d5db.
  Text in two tiers at 4.5:1 or more (about #111 and #5f6368; #6b6b6b is the
  lightest grey that holds). Status text green #247b50, not the lighter greens.
- **Dark**: a true neutral ground (#000, #111), never navy or slate; surfaces a
  lighter step with no border, or the ground with 1px lines; two text greys that
  read apart (~#b4b4b4, #949494); status as a hue on a dark tint of itself.
- A border or a shadow, never both. Radius is bimodal: tight 4-8px or soft
  16-24px, chosen once, nested radii stepping down. Icons outline, 14-20px, grey,
  one set; never in a saturated circle.

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

## The phone (house rule)

- The sidebar folds into a 48px top bar with the screen's name and a menu that
  opens a full-screen sheet, or a bottom bar of four or five destinations.
- 16-20px margins, 44px touch targets, data at 14px, the title at 20-24px.
- Filters collapse into one row of chips; the first list row starts in the top 60%
  of the screen. KPIs become a 2-column grid with an even count. Charts full
  width, 160-200px tall, 3-4 x labels.
- Tables become two-line rows: identity and key number on line 1, the other fields
  in 13px grey on line 2. Blocks that carry an action move up.
- The frame is the screen: no drawn bezel, notch or home indicator.

## What app screens may do that pages may not

| Allowed | Limit |
| --- | --- |
| 1px borders on cards, panels, tables, controls | About 1.1-1.3:1 against the ground; controls one step stronger |
| Small labels above values | 12-14px sentence case at 4.5:1; meta 11-12px; nothing under 11px; at most one tracked uppercase label per screen |
| Rows of identical cards | Peer objects only, 3-6 across, no orphan, no icon on top |
| Monospace | IDs and code, or every figure as the style's decision |
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
| Geist or Inter on #f8f8f8, white 12px cards, no hue on the data | The face from the sheet and one element only this product has |
| An illustration and "No data yet" in an empty chart | The zero line and one sentence |

A screen with every tell removed and nothing in their place is a tidy template.
What fills the space is the product: its own data at real size, the one question
answered by the biggest block, and a grid whose sums close.
