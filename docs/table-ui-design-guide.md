# The table card ui design.

Guideline for Making a better Table ui card.

Current Table Card is messy and has no visual hierarchy.

Here are the Guidelines you need to follow to make better table ui.

1. Highlight the table header with subtle color, not too dark but subtle that it can be recognized and read easily. Use `bg-muted` (solid) with a full `border-b border-border` so the header is clearly distinct from the body.
2. Use zebra stripes on alternating rows (`even:bg-muted/40`) to help the eye track rows across the table. The stripe must be barely perceptible.
3. Lighten the border shade between rows (`border-border/40`) so data scanning is calm.
4. Hover must be clearly stronger than the stripe (`hover:bg-muted/60`) so it is never lost.
5. Selected rows use `bg-primary/5` with `!important` to guarantee they always win over the zebra stripe.
6. Bold the important Record names (NameCell).
7. Micro-interactions: keep row hover transitions at ~150ms (`transition-colors`). Respect `prefers-reduced-motion`.
8. In Dates abbreviate the Month names.
9. Vertical padding for readable density: `py-2.5` on cells.
10. Numbers right-aligned with tabular-nums. Text left-aligned. Center alignment avoided.
