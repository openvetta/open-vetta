---
name: vetta-ui-design
description: "Build and edit design documents (.vetd) on the Vetta design canvas — app screens, landing pages, slides, posters, infographics. Use when the user asks for a UI design, mockup, screen, deck, or poster, or attaches a design frame/element from the canvas. Frames are real React (TSX) routes, not pictures. Do NOT use for ordinary front-end work in the user's own codebase — building, styling or reworking pages of a real app is that repo's job, and none of the vetd_* tools or canvas rules here apply to it."
---

# Vetta UI Design

A design document is ONE directory — `login-app.vetd/` — holding everything:

```text
login-app.vetd/
  design.json           ← canvas manifest. GENERATED — see below.
  frames/               ← one TSX file = one canvas frame = one route
    index.tsx           ← the site root "/"
    login.tsx           ← "/login"
    _layout.tsx         ← optional shared shell; `_` files are NOT frames
  components/           ← shared React components
  assets/               ← images, imported relatively
  theme.css             ← color/radius/shadow tokens (Tailwind v4 @theme)
  package.json          ← this design's npm dependencies; vetd_install writes it
  DESIGN.md             ← optional spec; OVERRIDES defaults in this skill
```

You write the sources; the plugin owns the manifest and reconciles
automatically. Every save hot-reloads the canvas. Two consequences worth
internalising before you start:

- **The file name IS the route and the frame id.** Create a screen by writing
  `frames/<kebab-id>.tsx`, delete one by deleting the file. There is no
  registration step anywhere.
- **Editing `design.json` is pointless, not just forbidden.** It is
  regenerated from your tsx declarations on every save, so any hand-edit is
  overwritten seconds later. If a frame is not showing up the way you expect,
  the answer is always in the tsx.

## The loop at a glance

Every turn that designs something runs this sequence; each step is detailed
under **Workflow** below.

1. **Start**: a new document is `vetd_create` with the product type; an existing
   one starts with `vetd_status` once.
2. **Look**: a landing page is dealt directions, app screens propose their own
   with `vetd_direction` `propose`; ask the look question, then `choose`. Apply
   the direction (fonts, `theme.css`, pictures) before any frame.
3. **Build**: shared shell and a short file per frame first, then real content in
   coherent batches. Each frame's `frame` meta line comes first.
4. **Verify**: one `vetd_screenshot` batch, Read the overview once, fix with
   `edit`, recheck only the frames you changed.
5. **Finish**: when you touched a `.vetd` design, the last action is one
   `vetd_notes` call; then report.

## It is a project, not a picture

The output is a running front-end app the user can click through in preview, built
from sources meant to ship. Decide structure BEFORE writing screens:

1. **Routes** — `frames/login.tsx` is `/login`, `index.tsx` is `/`.
2. **Navigation** — `import { Link, useNavigate } from "react-router"`.
3. **Shared chrome written once** — nav bar / sidebar / tab bar goes in
   `components/`, or in `frames/_layout.tsx` rendering `<Outlet />` when it must
   survive navigation. Never paste it into each frame.
4. **Shared vocabulary** — colors/radii/shadows from `theme.css` tokens
   (`bg-primary`, not `#0d99ff`); repeated blocks become components.

If changing the nav bar means editing more than one file, the structure is
wrong. Posters, slides and infographics are standalone artwork — steps 1-3 do
not apply to them.

## The one rule you have to hold in your head

**Frame meta is the FIRST statement**, one flat line (regex-parsed):

```tsx
export const frame = { width: 390, height: 844, title: "Login" };
```

Every frame declares its own. Omit it and the frame is rendered at a size
inferred from the rest of the design — it still reaches the canvas, but nothing
about that size is yours, and `issues` will keep asking until you declare one.
Sizes come from the product type below; when the design already has frames,
`vetd_status` lists their sizes and the design's `defaultFrameSize` — match them
unless the new screen is a different product type.

It gets its own section because it is the only convention here that needs
judgment from you. Everything else is either caught automatically or visible in
the render.

### Caught for you — copy the templates and these never come up

A checker parses every source you write; violations come back as `issues` on
`vetd_screenshot` and `vetd_status`, naming the file and line. A file that does
not parse, or that imports a package the engine does not have, comes back the
same way. The templates below are already correct on all of it:

- `h-full`, never `h-screen`/`min-h-screen` — a frame is a fixed-size canvas,
  not a viewport.
- Icons are Iconify classes — a `<span>` with a class, NOT a component:
  `<span className="icon-[lucide--search] size-4" />`. There is no icon package
  to import: `import { Search } from "lucide-react"` fails to build, and so does
  every other icon library. Never your own icon component, never inline SVG
  paths. Offline sets, and only these: `lucide`, `tabler`, `mdi`,
  `simple-icons` — naming any other set fails to build too.
- `<Link to>` from react-router for internal screens, never `<a href="/…">`, and
  never a locally redefined `Link`/`useNavigate`/`useLocation`.
- No remote image URLs (`<img>`, `background-image`) — they break screenshots.
  Import from `assets/`; `vetd_assets` finds real pictures and downloads them there.
- Normal formatting, one element per line for nested markup. Everything on one
  line destroys element→source mapping, and the user's "Ask Vetta" edits then
  point every element at the same line.
- One default export per frame, rendering edge-to-edge — no page margins.
- react, react-router, Tailwind v4 and Iconify are always there. Anything else
  has to be installed into the design first (see below) — importing a package
  that is not installed fails the build. No remote font links (Google Fonts
  `<link>`/`@import url(...)`) — typefaces are installed packages, see below.

### Dependencies are yours to choose — and yours to justify

A design is a real npm project: `vetd_install` adds packages to its own
`package.json`, and they travel with the design. `vetd_status` lists what is
already installed — read that before adding anything.

Install when the job is a solved domain problem where a hand-rolled version is
visibly worse: chart geometry and axes, Markdown or rich-text rendering, date
math and calendars, virtualised long lists, gesture/physics animation.

Build it yourself when Tailwind and React state already do it well — cards,
tabs, modals, dropdowns, toggles, steppers, progress bars, a simple bar or donut
drawn with divs or inline SVG, and layout of every kind. A UI kit pulled in for a
rounded card costs more than it gives: it arrives with its own design language
and spends the rest of the design fighting `theme.css`.

Never install an icon package (icons are Iconify classes), a CSS framework
(Tailwind v4 is here) or a router (react-router is here).

Install everything you need in ONE call, then import normally.

### Typefaces are packages too

System fonts give every design the same voice. A typeface is an npm package here
— a direction sheet gives the exact packages, imports and tokens. By hand:
`vetd_install` `@fontsource-variable/<slug>` (one file, every weight) or
`@fontsource/<slug>` (bare import is 400 only; import each other weight as
`@fontsource/<slug>/700.css` or the browser fakes the bold), import them at the
TOP of `theme.css` above `@theme` — install first, or the whole canvas loses its
styling — and declare `--font-*` tokens. The family name must be the registered
one: `-variable` packages append ` Variable`, static ones do not; `issues`
reports a mismatch. Latin faces only: every stack continues with the platform CJK
faces (serif: "Songti SC", "SimSun"; sans: "PingFang SC", "Microsoft YaHei").

### The one thing nothing catches: a token that does not exist

Theme tokens in `className` (`bg-primary`, `text-muted`) instead of hex — but
**the token must exist in `theme.css` `@theme`**. Tailwind generates nothing for
a class it cannot resolve, so `bg-brand` without `--color-brand` leaves the
element with no background at all. Same mechanism as a blank icon: the source
reads perfectly, and nothing renders. Add the token first, then use it.

## Structure first, lines second

Reach for whitespace, alignment and surface tone before you reach for a border:
a gap twice the size of the gaps inside a group already reads as a separation,
and a shared gutter already reads as a column. Then, for every line, divider or
card wrapper you are about to draw, answer one question — **what does it do that
space could not?**

The question does not presume the answer is no. A dense table, an object the
user acts on, a layer that overlaps scrolling content and a field that has to be
findable all answer it in a word; a wireframe, a report, a terminal UI or an
engineering console answers it for most of their lines. What it catches is the
line drawn out of habit — the box around every section, the rule under every
heading — which is a generated-UI tell rather than neutral styling.
`references/taste/whitespace.md` has the substitutions, the per-product-type
notes, and the cases where lines are the design. On a landing page the answer
outside tables, forms and `data-ui` interface fragments is always no — a house
rule below.

## Pick the product type

This is the first decision, not an afterthought: `vetd_create` requires it
(`product`, or `frameSize` in pixels for anything the enum cannot express), and
it becomes the design's default size. Read it off the user's own words, in
whatever language they wrote them — a phone app is `mobile`, an admin console or
dashboard is `desktop`. An explicit user instruction always wins. Do not default to a phone frame; a dashboard at 390 wide is the
most common failure.

| Product | `product` | Default size | What matters |
| --- | --- | --- | --- |
| Mobile screen | `mobile` | 390x844 | One primary action; thumb reach; full state coverage |
| Desktop app / dashboard | `desktop` | 1440x900 | Real density; aligned grid; no empty middle |
| Landing page | `landing` | 1440x2400 | hero → proof → CTA rhythm |
| Slide | `slide` | 1920x1080 | One idea; large type; generous margins |
| Poster / social | `poster` | 1080x1440 | One focal point; strong size contrast |
| Square social post | — | `frameSize` 1080x1080 | One focal point; strong size contrast |
| Infographic / chart | — | `frameSize`, free | Honest data, labeled axes, legible legend |
| Print (A4 portrait) | — | `frameSize` 794x1123 @96dpi, 2480x3508 @300dpi | Convert mm→px yourself; 300dpi only when the user asks for print |

The design default only covers frames that forgot to declare a size. A document
can mix product types — a poster next to three phone screens — as long as each
frame declares its own.

## Templates

Start from these three. They are the shape the checker expects; deviating from
them is how the mechanical `issues` above get triggered.

Their copy is English only because this file is; it says nothing about which
language to design in. Frame titles and every label inside a frame go in the
language the USER is writing to you in — same rule as your own replies.

```tsx
// frames/products.tsx — a screen is composition, nothing structural
export const frame = { width: 1440, height: 900, title: "Products" };

import { StatCard } from "../components/StatCard";

export default function Products() {
	return (
		<div className="flex h-full flex-col gap-6 bg-surface p-8 text-surface-foreground">
			<h1 className="text-xl font-semibold">Products</h1>
			<div className="grid grid-cols-4 gap-4">
				<StatCard label="In stock" value="1,284" />
			</div>
		</div>
	);
}
```

```tsx
// frames/_layout.tsx — the shell, mounted once, renders <Outlet /> itself.
// `h-full` here too: this wraps the frame, it is not a page.
import { Outlet, useLocation } from "react-router";
import { NavBar } from "../components/NavBar";

export default function Layout() {
	const { pathname } = useLocation();
	// Screens outside the app shell (login, onboarding) opt out here.
	if (pathname === "/login") return <Outlet />;
	return (
		<div className="flex h-full flex-col bg-surface">
			<NavBar />
			<div className="min-h-0 flex-1 overflow-auto">
				<Outlet />
			</div>
		</div>
	);
}
```

```tsx
// components/NavBar.tsx — the ONLY definition of this chrome
import { Link, useLocation } from "react-router";

const items = [
	{ to: "/", label: "Overview", icon: "icon-[lucide--layout-dashboard]" },
	{ to: "/products", label: "Products", icon: "icon-[lucide--package]" },
];

export function NavBar() {
	const { pathname } = useLocation();
	return (
		<nav className="flex items-center gap-1 px-4 py-3">
			{items.map((item) => (
				<Link
					key={item.to}
					to={item.to}
					className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
						pathname === item.to ? "bg-primary/10 text-primary" : "text-muted"
					}`}
				>
					<span className={`${item.icon} size-4`} />
					{item.label}
				</Link>
			))}
		</nav>
	);
}
```

## Workflow

The eight prides and shames (the tools repeat them) outrank every default below; only the user's words outrank them.

**New document**: pick the product type → `vetd_create` with it → set the
direction → start building. Do NOT offer the user a menu of styles: design
systems are a thing the user opts into from the Design sidebar, not something you
propose. Just design well for what they asked for; the direction step below
decides the look.

If the **project root** has a `design-resources/<slug>/` directory, the user
started this project from that style in the Design sidebar; it is the style
reference pack for this project and following it is the default:

- Read its `INDEX.md` (the file inventory), then its `DESIGN.md` — that spec
  is the style contract for what you are about to design.
- After `vetd_create`, write the pack's `theme.css` content into the design's
  own `theme.css` before building frames.
- **Before your first frame, Read the pack's demo HTML and screenshots too**
  (`INDEX.md` marks which is which). The demo is the spec applied to a full
  page — it answers what `DESIGN.md` alone cannot: real density, spacing
  rhythm, component shapes, how the palette is actually distributed. Skipping
  it is how a design ends up on-token but off-style. They are
  **visual reference only**: study layout and mood, never copy their markup or
  code into frames — frames are React + the tokens you just copied, not HTML.
- The user outranks the pack: if they ask for a different style, follow the
  user. Several packs side by side and no user pick: ask which one first.

The pack stays the contract in later sessions: before adding screens, re-read
its `DESIGN.md` (and glance at the demo).

If `DESIGN.md` exists in the design document, the user has already applied a
system — read it first and follow it, and do NOT rewrite it or `theme.css`.

**Set the direction** when neither a pack nor `DESIGN.md` sets the style. Left to
defaults, every design converges on the same thing — indigo and slate, one
system sans, white cards on grey, a three-column feature row — and
users recognise it instantly as generated. Following a fixed template is the
other way to get there. So the look is decided on purpose: a **landing page is
dealt** three directions from a researched library; **app screens are proposed**
by you — three directions of your own, which the tool checks.

1. **Inventory the subject** in your notes, before `vetd_create`. Page: eight to twelve things that
   belong to this client and no competitor — its name and what it means, its
   place, the numbers in the brief, the constraint it lives with, its materials,
   rituals and printed things. Then write the page's argument, one claim and its
   proof per section; a section with no claim is cut. App: the data the screens
   hold, the jobs people do there, the one question the first screen answers, and
   the things only this product has (its objects, units, rituals, places).
2. **Learn the preferences.** Learn what the user wants before designing,
   without pestering them: no fixed list of questions and no quota — ask only
   what their words left open and the answer would visibly change the design; a
   detailed prompt needs few or none, "just go ahead" needs none. If the prompt
   does not say what the product is or does, ask that first, before
   `vetd_create`. If the purpose is vague and the words give no sense of how
   daring to be, add one question to that same round: restrained, expressive
   or bold, each described by what it looks like, recommending restrained for
   tools and expressive for consumer apps, pages and posters. Words like
   "minimal" or "bold" already answer it. Pass `intent.boldness`; unasked,
   infer it from the product. Pass `brief`, `sector` (landing), `have` and `intent` — only
   what the user actually said or answered. What they said is binding; never ask
   it again.
3. **Get three directions.** Landing: `vetd_create` deals them. App:
   `vetd_create` returns `direction.propose` and raw `ingredients`; write
   `obvious` — the version you would make by habit (its colours, type, layout) —
   then `vetd_direction` `action: "propose"` with three options that each depart
   from it, each starting from something only this product has: "On these
   screens, [that thing] becomes [the device]." Put the nearest competitor in the
   first blank; if it still works, the idea is the category's. The three differ
   in light/dark, accent colour family and display type class; the tool rejects
   generated defaults (indigo, overused display faces, weak contrast), near
   twins and repeats of recent designs — fix what it lists and propose again.
4. **Choose.** If `direction.ask` (landing) or `ask` (app) comes back it is the
   look question, whose options say what each look is like: ask it, and in the
   same `ask_user_question` call anything else the prompt left open (the tool's
   note has the rules). Then `vetd_direction` `action: "choose"` with the look as
   `id` and the extra answers as `preferences`; if the look was already set,
   choose the option that can carry an item from your inventory. If the user
   describes their own look, deal again with it as `intent.mood` (an app then
   proposes again with it). Landing slots `redraw` only for a stated reason.
5. **Apply it before any frame**: `vetd_install` the sheet's fonts, write its
   `theme.css`, get its pictures with `vetd_assets`, and state the direction —
   `Direction: <direction> · <type> · <palette>`. The user redirects from there.
6. **Write the words before the markup** (`references/taste/copy.md`): the whole
   content of every section the brief asks for, at full density. Sample details
   are fine and listed in your report; proof — customers, quotes, logos, figures
   — is never invented.

Adding screens in a later session: `vetd_direction` with `action: "show"` reprints
the design's sheet; build from it rather than from memory.

**Slides, posters and infographics** are not dealt: read
`references/taste/directions.md` and set tone, anchor hue, type pairing and
structure yourself, then apply it the same way (step 5).

With a pack or `DESIGN.md` in charge, skip the colour and type: a landing page
may still deal its composition with `keep: ["palette", "type"]`, and app
directions then differ in layout and light/dark only. Every capture is still
screened against the house rules below, except a device the pack or `DESIGN.md`
explicitly asks for.

### House rules

They hold on every landing page and app screen, whatever the direction. The first
table is generated defaults — the things users read as "AI made this" — and holds
always. Removing them leaves space: fill it with scale, the full content, or a
field of flat colour — never another ornament, and never leave a screen thin.

| Rule | Instead |
| --- | --- |
| Headlines two lines or fewer; one `h1` on the first screen that says what this is | Cut words, then widen the measure, size last |
| No eyebrow labels, pill badges or "New ·" chips above headings | Put it in the heading or the first sentence |
| No 01 / 02 / 03 index numbering | Order by position, size or words; a real `<ol>` |
| No icon-topped feature cards, icons in tinted squares, rows of identical cards | The direction's own composition |
| No styled accent word in a headline | One colour; the words carry it |
| No white cards on a grey ground holding every block | A ground from the subject's world; one tone step |
| Running text in full ink at 16px on pages (14px in apps); nothing under 13px on pages, 11px in apps | Grey is for secondary notes |
| Equal outer margins; no section huddled on one side of an empty half | Close the void with a picture, list or column |
| No cream-and-terracotta, no violet or indigo, unless dealt or the user asked | The direction's palette |

The second table is expressive devices: a starting point, not a ban. A dealt
direction or a proposal's `devices` (with the reason) turns one on.

| Name it in `devices` to use it | Start from |
| --- | --- |
| Gradients, glows or glass | Flat colour, a tone step between surfaces |
| A shadow on anything at rest | Space or a tone step; shadows on what floats |
| Monospace outside code | The text face, `tabular-nums` for figures |
| Tiny tracked uppercase labels | Sentence case at a readable size |
| A third typeface | Two at most: display and text |

**Existing document**: `vetd_status` ONCE first. It returns the frame ids/sizes,
`sharedShell` (existing `_layout.tsx` + `components/` — reuse them) and
`issues`. Read `theme.css` and reuse what is there. You do not need to call it
again afterwards — `vetd_screenshot` returns `issues` per frame.

Then, for a multi-screen product, write in two passes:

1. **Skeleton pass.** Write the shared parts (`_layout.tsx`, `components/`),
   then EVERY frame as a short file: the `frame` meta line plus the page's
   structural blocks — header, the grid, section placeholders. A few dozen lines
   each. The whole set lands on the canvas within seconds, so the user sees the
   screen inventory and the layout immediately, and a wrong size or a wrong
   route shows up before you have written any detail.
2. **Detail pass in coherent batches.** Fill in real content for a small group
   of related frames (or the whole set when it is simple), then call
   `vetd_screenshot` once with `frames: [...]`. Read the returned contact sheet
   once and compare the screens together. Use the single `frame` form only for
   a targeted recheck after a fix. Each save still hot-reloads, so the user sees
   progress while one model/tool round verifies several screens.

Single screens, posters and slides skip the skeleton pass.

**Going back**: every design keeps its own version history — one version per turn
that changed it, saved automatically. So "undo that" or "restore the previous
version" is `vetd_history` then `vetd_restore`, NOT you editing files until they
resemble the old version from memory. Restoring is saved as a new version too, so a wrong
pick is one more `vetd_restore` away; the response says where the pre-restore
state went. The user can also use the canvas's history panel.

**Verify visually**: call `vetd_screenshot` with all frames you created or
changed (`frames: [...]`, or `all: true` when the whole design is in scope), then
Read the returned overview image once. You are looking for rendering defects
the code cannot show you — run the checklist in `references/quality.md`, which
starts with the three that account for most of them: **misalignment**,
**unintended text wrapping**, and **classes that resolve to nothing** (a blank
icon, or a surface whose theme token was never defined). A frame that does not
parse is listed as a failed member without discarding the other captures — fix
the reported line and recheck that frame only.

Every successful frame carries a `verification` observation. If `stalled: true`,
two checks gave the same image and issues: make no third blind edit, inspect
whether the checker fits the visible result, and report a false positive.
`vetd_status.issues: []` is source-only, never visual proof; `renderVerification`
says whether prior captures are current.

Nothing will remind you: the checker only speaks through `vetd_screenshot` and
`vetd_status`. A frame never included in a screenshot batch may sit on the
canvas as a build error or at a size you never chose, and only the user sees it.

**Check the structure**: for a UI product with several screens or repeated
chrome, answer these four before reporting; no checker sees them. Skip them
for posters, slides and single screens.

1. **Chrome defined once?** Grep for the nav bar's markup — it must appear in
   exactly one file. Two frames both containing the sidebar means extract it.
2. **Shell survives navigation?** Persistent chrome belongs in
   `frames/_layout.tsx`. Per-frame `AppShell` is acceptable only combined with
   `<Link>` navigation, otherwise nothing persists at all.
3. **Props actually match?** Nothing typechecks these sources at runtime, so a
   renamed prop fails silently — a component taking `name` but always called
   with `icon` renders one fallback everywhere, and the source reads fine.
4. **Every touched frame included in the latest batch, and its overview actually Read?**

**User notes on the canvas**: the user pins Figma-style notes onto frames (or
empty canvas), or types an instruction into the badge on a selected frame or
element — everything given from the canvas lands in `.notes.json` as a note, a
request addressed to you. A message asking you to handle notes never carries the
request text; `vetd_notes` is where you read it. Its `element.source`
(`frames/x.tsx:LINE`, re-resolved at read time, authoritative unless
`anchorStale`) is your edit target. If it points into `components/`, the change
hits every frame using it — say so in your reply.

Take them one at a time and `resolve` each one before starting the next; the
reply is what marks a note handled, so never touch `.notes.json` yourself. Treat
`pendingRemaining` in each `resolve` response as your loop condition and keep
going until it is `0` — anything new in it is something the user pinned while you
were working. Notes also reach you through an explicit "handle my notes" prompt,
a `pendingNotes` count in `vetd_status`, and a flag on the frame
`vetd_screenshot` just shot.

Users pin requests rather than interrupt a turn, so a note can appear after your
last screenshot unannounced. **Done** means:
every frame you touched is represented in the latest screenshot batch and its
overview was Read, each current frame capture is free of the three screenshot
defects and of the generated-UI tells in `references/quality.md` § 5, its
per-frame `issues` came back empty (or a repeated false positive is explicitly
reported as stalled), and no user note is left pending. None of that is checked
for you at the end of the turn, so before you report, name the frames you
touched and confirm each one cleared all three.

Hence a hard rule: **when you touched a `.vetd` design this turn, the final
action — after the work, right before you write your summary — is one more
`vetd_notes` call.** Run it even when nothing this turn mentioned notes. Anything
still pending is work the user asked for while you were busy: do it now,
`resolve` it, check again, and report only once a check comes back clean.

The condition is the whole rule, so read it literally: **a turn in which you
wrote or edited no file inside a `.vetd/` directory ends with no `vetd_notes`
call at all** — editing pages in the user's own repo, answering a question,
running tests. Calling it there is not a harmless extra check: it fails, and it
tells the user you mistook their codebase for a design document. Same for every
other `vetd_*` tool — none of them apply to work outside a `.vetd`.

At that point stop and report — do not keep polishing. If something is still off
but you have already revised it twice, say what it is instead of attempting a
third pass.

## Exporting deliverables

When the user asks to export, download or hand off the design ("导出 PDF",
"export all frames as images"), call `vetd_export`. It writes into the current
working directory, and each file holds the frame's FULL content, including what
scrolls below the viewport. `format: "pdf"` gives one `<design>-frames.pdf`, one
page per frame; `format: "images"` gives one PNG per frame in a
`<design>-frames/` folder. Omit `frames` for every frame in canvas order; pass
`frames: [...]` when the user named specific screens.

**One format per request — the one the user asked for.** Never export both:
every format re-renders every frame, so doing both doubles a slow export for a
file nobody asked for. If the user did not say which, ask.

**Export is not verification.** It runs no checks: do not screenshot or
re-verify before exporting, and do not Read the exported files afterwards. Just
tell the user where they are.

## Do not rework

Rewriting your own output is the single largest waste in this workflow, and it
buys nothing: a revision made without looking at the render is a guess.

- **Never re-read a file you just wrote.** Its contents are already in context.
- **Fix with `edit`, never by rewriting the whole file with `write`.** Both the
  `issues` and the build errors you get back name a file and a line; go there.
  A full rewrite costs many times more and usually introduces a new defect.
- **Screenshot before revising.** Once a coherent frame batch is written, the
  next thing you do to it is one `vetd_screenshot` batch. Do not polish it first
  — you cannot see what is wrong yet. One evidence-based revision pass per
  capture; recheck only the frames you changed.
- **Do not restate the plan between steps.** A todo list is worth it only when
  the design has more screens than you can hold at once. Create it once and
  update it at phase boundaries; never spend one tool round marking every frame
  complete immediately after its write.

## References (read on demand)

Resolve against `$SKILL_DIR`. Do not read them all up front.

| File | Read it when |
| --- | --- |
| `references/interaction.md` | Wiring clicks, `_layout.tsx`, cross-screen flows |
| `references/quality.md` | Reviewing a screenshot; before declaring any frame done |
| `references/taste/directions.md` | A slide, poster or infographic with no pack or `DESIGN.md` (landing pages are dealt, apps proposed) |
| `references/taste/whitespace.md` | Weighing whether a line, divider or card wrapper earns its place; a capture looks boxed-in |
| `references/taste/app-screens.md` | Product type is app screens or a dashboard — read it before the first screen; the app sheet ends with the parts (`app/*.md`) the screens use |
| `references/taste/app-screens-content.md` | The app is content-led or consumer (media, ordering, travel, games): read it beside `app-screens.md` |
| `references/taste/texture.md` | A held object (card, ticket) or depth is wanted: light, grain, edge |
| `references/taste/color.md` | Setting a palette by hand; chart and status colors |
| `references/taste/typography.md` | Choosing faces by hand, the type scale, CJK font stacks |
| `references/taste/copy.md` | Writing headlines, labels, empty and error states |
| `references/taste/anti-patterns.md` | A capture looks generic, or a tell from quality.md § 5 needs its fix |
