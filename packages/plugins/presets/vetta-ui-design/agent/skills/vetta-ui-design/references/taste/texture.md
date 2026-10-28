# Texture and material

Read when the screen has an object that exists in the world — a bank card, a
ticket, a record sleeve, a coupon, a gift card, a key fob, a coffee bag — or when
the direction asks for depth. A flat rectangle with text on it is a box, not a
card. People feel a surface through three things: **light** (where it comes
from), **grain** (what it is made of), **edge** (where it stops).

## When texture belongs

- One **hero object** per screen carries it. Everything around stays flat and
  quiet, which is what makes the object read as an object. Two textured things
  compete; ten is wallpaper.
- Texture belongs on things you could hold. Not on the shell, the sidebar,
  tables, forms or charts.
- Declare `texture` in the direction's `devices` (with the object it is for);
  that lets the object's gradients and shadow through the screenshot check.
  Without it `tell-gradient` and `tell-shadow` will report the card.

## The rules that make it look real

1. **One light.** Top-left unless the direction says otherwise. Highlights sit on
   the top and left edges, shadows fall bottom-right. Mixed directions read as
   broken.
2. **Grain at 4-10% opacity.** Visible only when you look for it. Above 12% it is
   dirt. `mix-blend-overlay` keeps it from greying the colour.
3. **An edge of two lines.** A 1px light line inside the top edge and a 1px dark
   line inside the bottom edge give a surface thickness more cheaply than any
   shadow.
4. **Colour from the direction.** Build the surface from the accent and ground
   tokens (`color-mix(in oklch, var(--color-accent) 70%, black)`), never a stock
   gradient. No purple-to-blue.
5. **Text stays readable.** 4.5:1 against the darkest and lightest part of the
   surface it sits on; emboss does not replace contrast.
6. **A physical shape.** Real proportions (a card is 1.586:1), real corner
   radius (about 5% of the width), the details the object really has (chip,
   magnetic strip, perforation, barcode, fold).

## Grain, once per design

Put it in `theme.css` and reuse it:

```css
:root {
	--grain: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
}
```

## Recipes

**Bank card** — light from the top-left, grain, a sheen, a two-line edge:

```tsx
<div
	className="relative aspect-[1.586] w-[340px] overflow-hidden rounded-[18px] text-white"
	style={{
		background:
			"radial-gradient(120% 90% at 0% 0%, color-mix(in oklch, var(--color-accent) 80%, white) 0%, transparent 60%), linear-gradient(135deg, color-mix(in oklch, var(--color-accent) 55%, black), color-mix(in oklch, var(--color-accent) 22%, black))",
		boxShadow:
			"inset 0 1px 0 rgb(255 255 255 / .35), inset 0 -1px 0 rgb(0 0 0 / .4), 0 18px 30px -14px rgb(0 0 0 / .5)",
	}}
>
	<div className="absolute inset-0 opacity-[.07] mix-blend-overlay" style={{ backgroundImage: "var(--grain)" }} />
	<div className="absolute inset-y-0 left-[38%] w-24 -skew-x-12 bg-gradient-to-r from-transparent via-white/12 to-transparent" />
	{/* chip, contactless mark, number in tabular-nums, name, expiry */}
</div>
```

**Brushed metal** — a repeating hairline over a soft linear gradient:
`background: repeating-linear-gradient(90deg, rgb(255 255 255 / .05) 0 1px, transparent 1px 3px), linear-gradient(180deg, #d9dde2, #aeb4bb 55%, #cfd3d8)`.
For a metal card put the number in letterpress (below).

**Paper / print** — ground one tone warm, grain at 6%, a faint fibre line, an
edge shadow of 1px only: tickets, receipts, coupons. A torn or perforated edge
is a CSS mask (`radial-gradient` circles along the edge), not an image.

**Letterpress / emboss** — text a few percent darker than the surface, with
`text-shadow: 0 1px 0 rgb(255 255 255 / .35)` (pressed in) or
`0 -1px 0 rgb(0 0 0 / .35)` on dark (raised). Numbers only; never body copy.

**Frosted glass** — only over content that moves behind it (a sheet over a list,
a card over a photo): `backdrop-blur-xl`, a 1px `border-white/20`, a fill at 40-60%.

**Enamel / glossy plastic** — a top-half highlight: an absolutely placed layer
with `linear-gradient(180deg, rgb(255 255 255 / .22), transparent 45%)`, and a
darker, saturated base. One highlight, never two.

## Checks

- Squint at the screenshot: the hero object should be the most "lit" thing, the
  rest of the screen should step back.
- Take the grain away in your head: if the object reads as a flat gradient, the
  edge lines and the sheen are doing too little.
- A card face is not a fake picture slot: the check skips a 1.586:1 gradient
  surface that carries text.
