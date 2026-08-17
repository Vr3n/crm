# Depth & Elevation Refactor Guidelines
### For: CrownCRM dashboard — shadcn/ui + React + Tailwind v4, OKLCH tokens, `--radius: 0`
### Goal: Add perceptual depth using shadow + your existing cyan/pink token system — no new colors, no radius changes, no component API changes.

---

## 0. Two things in your current `main.css` are the actual root cause of "flat"

Before touching components, understand *why* it's flat — it's not missing tokens, it's two specific choices:

1. **`--card` and `--background` are identical** (`oklch(1 0 0)` both, light mode). A card sitting on the page has *zero* color contrast with the page itself. Right now the only thing separating a card from the canvas is a 1px `--border`. This means **shadow is not optional here — it's the only available depth signal**, since you can't lean on a background-color step the way most systems do.
2. **`--radius: 0` is intentional** (per your own comment block — "ONE radius scale... no mixed corner systems"). This is a deliberate sharp-edged, technical aesthetic (Space Grotesk + IBM Plex Mono reinforces this). That means: **do not introduce `rounded-md`/`rounded-lg`/soft blur-heavy shadows** — they'll fight the sharp-corner language. Shadows here should be tighter, more defined, less "cloud-soft" than a typical SaaS app. Think: a card that looks *cut and lifted*, not *pillow-soft*.
3. Your own token comment already tells you the intended interaction language: **pink (`--accent`) drives hover/secondary emphasis, cyan (`--primary`) drives actions.** Your current build likely under-uses `--accent` for hover states. This guideline leans on that instead of inventing a gray hover state — it keeps you inside your existing color-consistency lock.

**Rule for this whole pass: no new colors. No radius changes. Only shadow tokens + reuse of existing `--muted` / `--accent` / `--border` / `--primary` for surface/hover layering.**

---

## 1. Add elevation tokens to `main.css`

Insert into `:root` (after `--sidebar-ring`):

```css
:root {
  /* ...existing tokens... */

  /* Elevation — tuned tighter/harder than default shadcn shadows to match
     the zero-radius, sharp-edge aesthetic. Neutral (foreground-derived),
     not colored, so it works under any accent. */
  --shadow-color: 220 3% 15%; /* derived from --foreground hue/neutral, HSL for easy alpha math */
  --shadow-xs: 0 1px 1px hsl(var(--shadow-color) / 0.06), 0 1px 2px hsl(var(--shadow-color) / 0.04);
  --shadow-sm: 0 1px 2px hsl(var(--shadow-color) / 0.07), 0 2px 4px hsl(var(--shadow-color) / 0.05);
  --shadow-md: 0 2px 3px hsl(var(--shadow-color) / 0.08), 0 4px 8px hsl(var(--shadow-color) / 0.06);
  --shadow-lg: 0 4px 6px hsl(var(--shadow-color) / 0.10), 0 10px 16px hsl(var(--shadow-color) / 0.08);
  --shadow-xl: 0 6px 10px hsl(var(--shadow-color) / 0.12), 0 16px 24px hsl(var(--shadow-color) / 0.10);
}
```

Insert into `.dark` (after `--sidebar-ring`):

```css
.dark {
  /* ...existing tokens... */

  /* In dark mode pure black shadows barely read against a near-black
     background — lean more on the shadow AND brighten borders slightly
     (matches your existing dark --border: oklch(1 0 0 / 10%) pattern). */
  --shadow-color: 0 0% 0%;
  --shadow-xs: 0 1px 1px hsl(var(--shadow-color) / 0.30), 0 1px 2px hsl(var(--shadow-color) / 0.20);
  --shadow-sm: 0 1px 2px hsl(var(--shadow-color) / 0.34), 0 2px 4px hsl(var(--shadow-color) / 0.26);
  --shadow-md: 0 2px 3px hsl(var(--shadow-color) / 0.38), 0 4px 10px hsl(var(--shadow-color) / 0.30);
  --shadow-lg: 0 4px 6px hsl(var(--shadow-color) / 0.42), 0 10px 20px hsl(var(--shadow-color) / 0.36);
  --shadow-xl: 0 6px 10px hsl(var(--shadow-color) / 0.46), 0 16px 28px hsl(var(--shadow-color) / 0.42);
}
```

Register as Tailwind v4 theme keys inside your existing `@theme inline { ... }` block (so `shadow-xs`, `shadow-sm` etc. become real utility classes, same pattern you already use for `--color-*`):

```css
@theme inline {
  /* ...existing tokens... */
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
}
```

**Elevation tier map** (use this consistently, don't freelance new shadow values per component):

| Tier | Class | Use for |
|---|---|---|
| 0 | none | Page canvas, `--background` |
| 1 | `shadow-xs` | Resting cards, table container |
| 2 | `shadow-sm` | Sticky top bar, hovered cards/rows |
| 3 | `shadow-md` | Open dropdowns, popovers, tooltips |
| 4 | `shadow-lg` | Dialogs, sheets, command palette |
| 5 | `shadow-xl` | Toasts (only thing allowed above a dialog) |

Never exceed tier 5 anywhere in the app.

---

## 2. Card (`card.tsx`)

```diff
- className="border bg-card text-card-foreground"
+ className="border border-border bg-card text-card-foreground shadow-xs
+            transition-shadow duration-150"
```

- Border stays exactly as-is (`--border` token, unchanged).
- Since `--card === --background`, do **not** rely on hover background shifts for card-level interactivity — use `hover:shadow-sm` only, and only on cards that are themselves clickable (not static containers like the table-wrapping cards).
- Icon badges inside card headers (the clock/rupee icon squares): keep fill color exactly as-is, add a top-light hairline instead of a gradient overlay (gradients read too soft against your sharp-corner language):

```css
.icon-badge {
  border-top: 1px solid oklch(1 0 0 / 0.35);
}
```

---

## 3. Top navigation bar

```diff
- className="border-b bg-background"
+ className="sticky top-0 z-30 border-b border-border bg-background/95
+            backdrop-blur-sm shadow-sm"
```

Tier 2 — should visibly sit above scrolled content.

---

## 4. Table (`table.tsx`) — biggest-impact change

### 4a. Header row — use `--muted`, which already exists for exactly this purpose
```diff
- <TableRow className="border-b">
+ <TableRow className="border-b border-border bg-muted/60">
```

### 4b. Body rows — hover uses `--accent` (your documented "hover emphasis" pink), not gray
```diff
- <TableRow className="border-b">
+ <TableRow className="border-b border-border transition-colors duration-100
+            hover:bg-accent/50 data-[state=selected]:bg-accent/70">
```

Add a left accent bar using `--primary` (cyan) on hover — cyan = action/focus per your token comment, so this reads as "this row is actionable," while the background pink tint reads as "this row is being looked at":

```css
.data-table-row {
  box-shadow: inset 3px 0 0 0 transparent;
  transition: box-shadow 120ms ease;
}
.data-table-row:hover {
  box-shadow: inset 3px 0 0 0 var(--primary);
}
```

### 4c. Table container
Wrap the table in a container with `shadow-xs border border-border overflow-hidden` (no rounded-* — respect zero radius) so it reads as one lifted object.

### 4d. Row action icon buttons (eye / bell)
```diff
- className="border h-8 w-8"
+ className="border border-border h-8 w-8 shadow-xs
+            transition-all duration-100
+            hover:shadow-sm hover:-translate-y-px
+            active:translate-y-0 active:shadow-xs"
```
Keep the `-translate-y-px` subtle — 1px max. With sharp corners this tiny lift reads more "mechanical/precise" than "soft," which fits the aesthetic.

---

## 5. Buttons (`button.tsx`) — hierarchy via elevation, not new colors

In the dashboard's quick-action row (`New Lead`, `Schedule Follow-Up`, `Schedule Activity`, `New Membership Sale`):

- Exactly **one** action → `variant="default"` (your existing cyan `--primary` fill). Add shadow lift:
```diff
/* default variant */
- className="bg-primary text-primary-foreground"
+ className="bg-primary text-primary-foreground shadow-sm hover:shadow-md
+            transition-shadow duration-150"
```
- All other actions stay `variant="outline"`, unchanged, no shadow. The elevation gap alone creates the hierarchy your four identical buttons currently lack.

- Global pressed-state depth (all variants):
```diff
- className="..."
+ className="... active:scale-[0.98] active:shadow-xs transition-transform duration-100"
```

---

## 6. Badges / status pills (`badge.tsx`)

Add an inset ring one step darker than the fill, using colors already in the same hue family — for your semantic tokens specifically:

```diff
/* destructive/expired pill */
- className="bg-destructive/10 text-destructive"
+ className="bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/25"

/* warning/due-soon pill */
- className="bg-warning/10 text-warning-foreground"
+ className="bg-warning/10 text-warning-foreground ring-1 ring-inset ring-warning/30"

/* success/paid pill */
- className="bg-success/10 text-success-foreground"
+ className="bg-success/10 text-success-foreground ring-1 ring-inset ring-success/25"
```

Note: if `Badge` currently hardcodes `rounded-full` independent of your `--radius` token, leave that shape alone — it's a pre-existing exception, not something this depth pass should touch. Only the ring is new.

---

## 7. Sidebar

```diff
- className="bg-sidebar border-r"
+ className="bg-sidebar border-r border-sidebar-border"
```

Inset shadow on the **main content wrapper** (canvas side), not the sidebar itself, so the seam reads as a step rather than a flat cut:
```css
.app-canvas {
  box-shadow: inset 6px 0 12px -8px hsl(var(--shadow-color) / 0.10);
}
```

Active nav item already uses `--sidebar-accent` (pink tint) — good, on-system. Just add lift:
```diff
- className="bg-sidebar-accent text-sidebar-accent-foreground"
+ className="bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
```

---

## 8. Dropdowns / Popovers / Select / Dialog / Toast

Verify shadcn's defaults are already pulling from your new `--shadow-*` vars rather than Tailwind's built-in arbitrary shadow scale (`shadow-lg` out of the box in shadcn is *not* the same as your `var(--shadow-lg)` unless you registered it in `@theme inline` per §1 — confirm the override took).

| Component | Tier |
|---|---|
| DropdownMenu / Select content | 3 (`shadow-md`) |
| Popover / Tooltip | 3 (`shadow-md`) |
| Dialog / Sheet | 4 (`shadow-lg`) |
| Toast | 5 (`shadow-xl`) |

No structural changes if the token swap in §1 already propagates — just audit.

---

## 9. QA Checklist

- [ ] No value in `:root`/`.dark` was changed except new `--shadow-*` additions
- [ ] `--radius` still `0` everywhere — no `rounded-md`/`rounded-lg`/`rounded-full` introduced by this pass (except pre-existing Badge exception)
- [ ] Table header uses `bg-muted/60`, body hover uses `bg-accent/50` — no invented gray tokens
- [ ] Row hover shows both accent-tinted background AND cyan (`--primary`) left inset bar
- [ ] Exactly one filled/`default` button per action group; rest stay `outline`
- [ ] All semantic badges (destructive/warning/success) have matching-hue inset ring
- [ ] Dropdowns/popovers/dialogs sit at a visibly higher shadow tier than resting cards
- [ ] Dark mode checked separately — shadows should feel *slightly stronger* than light mode since background is dark (per §1 dark tokens)
- [ ] No shadow exceeds `shadow-xl` (tier 5) anywhere

---

## 10. What NOT to touch

- `--radius` (locked to 0 — do not add rounded corners anywhere in this pass)
- Any existing `--primary` / `--secondary` / `--accent` / semantic color values
- `--card` / `--background` being identical — don't "fix" this by diverging them; shadow is the intended depth lever here, not a background-color split
- Font tokens (`--font-sans`, `--font-heading`, `--font-mono`)
- Spacing/padding scale, icon set, component prop APIs

This keeps the refactor purely additive at the CSS-variable layer — fully reversible by deleting the `--shadow-*` block and the few `className` diffs above, without touching color or shape tokens at all.
