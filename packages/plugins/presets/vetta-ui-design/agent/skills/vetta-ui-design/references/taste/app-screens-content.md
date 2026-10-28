# Content-led app screens

Read this beside `app-screens.md` when the app is something people use for its
content or for how it feels: ordering, media, music, travel, banking for
consumers, community, games, creative tools, a personal home. A work tool
(admin, analytics, queues, settings) stays with `app-screens.md` alone.

`app-screens.md` was learnt from 23 work tools, so its numbers (3% coloured
pixels, no shadow, one 2px line) describe restraint, not taste. Applied to a
cinema app or a coffee order they give a tidy grey template. Here the content
leads and the screen is allowed to be felt.

## What changes

| In a work tool | Here |
| --- | --- |
| Colour on data, about 3% of pixels | Colour at area scale: a ground from the product's world, a full-bleed band, a large field behind the main object. 15-40% is normal |
| A 24px noun for a title | A title that carries the product: 32-72px, a display face with character; a greeting is fine on a personal home, without an emoji |
| Pictures are an exception | Pictures are the screen. Covers, dishes, places and people at display size, cropped with intent, from `vetd_assets` |
| Flat, no shadow at rest | A surface may have depth when the product has a material (paper, glass, enamel, felt): one tone step plus one quiet shadow level |
| A gradient only under a chart line | A gradient may be a surface when it is the brand hue moving within its own family (two stops, a hue shift under 40°) and the direction says so |
| One shell, a grey navigation pill | The shell can be the design: bottom tabs with a raised centre action, a full-bleed canvas with floating controls, a split view, a rail |
| Rows of equal cards | Scale contrast: one large object, a few small ones; overlap, bleed to the edge, an off-axis crop |
| Motion is feedback only | A screen may enter once (under 400 ms) and screens may transition when it explains where you went |

## What does not change

- Honest data: numbers come from the data file, totals are computed, no invented
  proof, no placeholder people.
- Contrast, alignment, one left edge, grid sums that close, nothing clipped.
- Real pictures in picture slots (`tell-fake-media` still applies).
- No purple-to-blue, blue-to-cyan or orange-to-pink gradients, no gradient text,
  no blurred blobs, no coloured glow shadows.
- Every ornament names something, or goes.

## A hero object carries the material

If the product has something people hold — a card, ticket, record, coupon, bag —
that object is the most carefully made thing on the screen and the only textured
one: light, grain and an edge, from `texture.md`. A bank app whose card is a flat
rounded rectangle has not been designed yet. Declare `texture` in `devices`.

## The run, in addition to `app-screens.md`

1. **Name the one thing** a person would describe to a friend after using the
   screen ("the whole page turns the colour of the album"). It is the largest and
   most deliberate element, and it is built from the product's own things.
2. **Choose the composition before the blocks**: where the eye lands first, what
   is oversized, what bleeds off the canvas, what overlaps. A list of blocks
   comes second.
3. **Spend the extra freedom on one or two moves**, not all of them. A screen with
   a gradient, a shadow, glass and an entrance animation is decoration. A screen
   with one big move and quiet everything else is a design.
4. **Check against the neighbour**: swap the logo for the nearest competitor's. If
   the screen still works for them, the one thing is not yet yours.
