# Anti-patterns — the generated-UI tells

Each of these is a default the model was trained into. One in a frame is a
problem; two together and the design reads as generated at a glance. Every entry
is visible in a `vetd_screenshot`, which is where to look for them.

Format: the tell → the fix.

## Everywhere

**Purple/blue gradient surfaces.** Hero or card backgrounds fading purple→blue,
blue→cyan, orange→pink. → One anchor hue on a solid tinted surface. If it needs
warmth, tint the neutrals.

**Gradient text.** `bg-clip-text` with a gradient on a heading. → Solid ink;
emphasis from weight, size or the accent on one word.

**Aurora blobs and floating orbs.** Blurred color blobs or 3D spheres behind
content "for depth". → Cut them. The atmospheric family's one or two soft
radial glows are the only exception, background only.

**Glass as decoration.** Frosted `backdrop-blur` panels over a gradient. → Solid
surfaces. Blur only for an overlay that actually sits over content.

**Pure black / pure white, flat grey.** `bg-black`, `bg-white` base,
zero-chroma slate. → Tinted ink and paper tokens (`color.md`).

**The scaffold palette.** Indigo primary, slate surfaces and text, amber accent —
Tailwind's defaults. → Replace every value in `theme.css` with the direction's palette.

**One font at two sizes.** Display and body in the same system sans. → A real
pairing (`typography.md`).

**Italic headings.** An italic headline, or one italicised word inside an
upright one. → Upright headings; weight or accent for emphasis.

**Card-in-card.** A bordered panel holding bordered cards holding bordered chips.
→ One containment layer. Usually remove the outer one.

**Side-stripe card.** A 3–6 px colored bar on one edge of a card or alert. →
Hairline all round, a tinted surface, or a small accent mark beside the title.

**Colored glow shadows.** `shadow-lg shadow-primary/50`; any shadow on a dark
surface. → Elevation by lightness on dark; one quiet shadow level on light.

**Emoji as icons.** ✨ 🚀 ⚡ 🎯 as feature, step or tier icons. → An Iconify glyph
from one set used across the whole design, or no icon.

**Mixed icon voices.** `lucide` in the nav, `mdi` in cards, `tabler` in the footer.
→ One set per design; a second only for brand logos (`simple-icons`).

**Eyebrow on every section.** `01 / FEATURES` or an uppercase kicker over every
heading, especially a label column beside the heading. → No eyebrows unless the
content is genuinely ordinal; when used, stacked directly above its heading.

**Centred everything.** Every heading, paragraph and button on one centre axis.
→ Bias the layout; at most two centred elements per block.

**Uniform rhythm.** Every section, card and gap the same padding. → Vary it:
tight groups, generous separations.

**Invented proof.** "10× faster", "trusted by 50,000+ teams", "99.9 % uptime",
+47 % in a stat tile — numbers the user never gave. → Use the real number, a `—`
with a "metric to confirm" label, or a layout without a proof slot. Sample data
inside an app screen (orders, balances) is fine; claims about the product are
not.

**Placeholder people and products.** Jane Doe, John Smith, 张三/李四, Acme,
Nexus, "Company Name", Lorem ipsum. → Plausible, audience-specific names and
content in the user's language.

**Decoration without meaning.** A "42" in a corner, a random badge, a sticker, a
cursor glyph beside a headline. → Every ornament names something (an issue, a
year, a version, a status) or goes.

## Landing pages

Governed by the house rules in SKILL.md and the dealt direction sheet: the hero
and every section come from its blueprints, so the template sequence, the icon
feature grid and the default nav and footer never get a chance to appear. One
tell the sheet cannot prevent: **re-drawn chrome** — fake browser bars, CSS phone
bezels, window chrome around a code block. Show the content itself; device
mockups come from the canvas's mockup export, never from markup inside a frame.

## App screens and dashboards

`app-screens.md` § Tells of generated dashboards, and the dealt app sheet's
"Off-style here" line.

## Mobile screens

**Drawn device.** Notch, island, bezel, home indicator, or a hand-written 9:41
with signal, Wi-Fi and battery glyphs. → The frame is the screen. The status bar
is the `StatusBar` preset from `@vetta/ios` and nothing else; the device is
added by mockup export.

**Floating centred card on a gradient.** A login or onboarding form as a card
floating mid-screen. → Full-bleed screen layout, content anchored to the top,
primary action within thumb reach at the bottom.

**Five equal bottom actions plus a FAB.** → One primary action per screen; the
tab bar holds navigation, not actions.

## Slides and posters

**Centred title + subtitle on a gradient.** The default title slide. → A
composition: off-centre type at an extreme size, one focal element, solid or
photographic ground.

**Bullet walls.** Six bullets at 28 px. → One idea per slide; the claim as the
headline, evidence as one chart, number or image.
