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
