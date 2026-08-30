# CrownCRM Theme Implementation Guide

## 1. Product character

CrownCRM should feel like a calm, premium operations workspace for a health and vitality business. The interface is efficient first, but it should have a recognizable point of view: crisp white surfaces, confident teal branding, soft blush highlights, compact controls, and small moments of reassurance. Avoid making the dashboard feel playful, gamified, or overly decorative.

Design principles:

- **Calm before clever:** information must remain scannable at a glance.
- **Quietly premium:** use spacing, restraint, and surface hierarchy instead of gradients or excessive decoration.
- **Action-oriented:** every empty state and toolbar should suggest what the user can do next.
- **Human operational tone:** copy should feel encouraging and specific, not robotic.
- **One signature accent:** teal is the primary brand signal; pink, amber, and emerald are reserved for contextual meaning.

## 2. Color system

| Role           | Light value                                           | Usage                                                |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Neutral system | `#F5F8FA`, `#FFFFFF`, `#202A32`, `#76828B`, `#DFE6E9` | Page background, surfaces, text, muted text, borders |

Implementation rules:

- Define the palette as semantic CSS variables in `globals.css`.
- Use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, and equivalent semantic tokens in components.
- Do not introduce purple gradients, neon accents, or arbitrary one-off colors.
- Accent colors should appear in icon tiles, badges, indicators, and contextual controls—not large page backgrounds.
- Always pair a custom background with a readable foreground color.

Dark mode should preserve the same hierarchy rather than invert every color. Use deep blue-charcoal surfaces, softened borders, teal for focus/active states, and desaturated accent backgrounds.

## 4. App shell and layout

### Desktop

- Fixed left sidebar: approximately 240–260px wide.
- Top command bar: 64–80px high, spanning the content area.
- Main content: fluid width with a comfortable max-width around 1680–1760px.
- Page padding: approximately 24px horizontal and 28–32px vertical.
- Use Flexbox for shell, nav, toolbars, and alignment. Use CSS Grid only for the quick-action row and two-column data-card area.

### Responsive behavior

- At tablet widths, reduce sidebar width and collapse the two data cards to one column.
- At mobile widths, hide the desktop sidebar and show a compact brand mark in the top bar.
- Stack the greeting status below the heading.
- Make toolbar search full-width on a new row.
- Keep touch targets at least 40–44px high.
- Never allow tables or controls to overflow the viewport without intentional scrolling.

Profile footer:

- Use a small circular initials avatar with a pale teal background.
- Display the owner name and role as two clear text levels.
- Keep the footer visually anchored to the bottom of the rail.

## 6. Top command bar

The top bar is a productivity surface.

- Keep the active page name close to the left edge.
- Make global search the dominant flexible element.
- Search field: pale input surface, 1px border, teal focus border, and a `⌘ K` keyboard hint on desktop.
- Add a theme button with an accessible label and a circular initials avatar on the right.
- On focus, use a restrained 3px translucent teal ring; do not animate width aggressively.

Keyboard behavior:

- `⌘/Ctrl + K` should focus global search when implemented.
- Escape clears or dismisses transient search state where appropriate.
- Focus styles must remain visible for keyboard users.

## 7. Greeting and status

The greeting is the dashboard’s human layer.

Recommended structure:

- Small date line in muted text.
- Main heading (h4): `Good morning, <logged in user name>` with only the final punctuation or key phrase in teal.
- Right-aligned status: teal/emerald pulse dot and `All systems healthy`.

The status dot may use a very subtle pulse, but avoid constant attention-grabbing animation. Respect `prefers-reduced-motion` by disabling the pulse.

## 8. Quick-action row

This is the dashboard’s signature interaction.

Actions:

- New Lead
- Schedule Follow-Up
- Schedule Activity
- New Membership Sale

Visual treatment:

- Four equal-width compact action buttons on desktop.
- White/card surface, 1px border, very soft shadow.
- Each action includes a small tinted icon tile and a trailing plus icon.
- Use teal, emerald, amber, and pink icon treatments respectively.

Interaction choreography:

1. On hover, lift the button by 2–3px.
2. Increase shadow softly and tint the border toward teal.
3. Translate or brighten the icon tile by a small amount.
4. On press, return to the resting plane with a 1px downward movement.
5. On activation, show the form dialogue.

Keep the interaction under 220ms and use an ease-out curve. The purpose is to communicate responsiveness, not spectacle.

## 9. Data cards

Each card should have:

- A clear icon tile and title.
- A concise supporting description.
- A toolbar with filter, export, and search controls.
- A table header that remains readable even when the state is empty.
- A meaningful empty state.
- Footer controls for rows per page, result count, and pagination.

Surface hierarchy:

- Page background: soft neutral.
- Card: white with 1px border and low-elevation shadow.
- Toolbar controls: slightly tinted input surfaces.
- Empty region: near-white inset with a dashed or low-contrast boundary only when useful.

Avoid heavy card outlines, excessive corner radius, and decorative stat numbers that do not support a decision.

## 10. Empty states

Empty states should feel like a successful pause, not a system failure.

Structure:

- Centered icon inside a pale contextual circle or tile.
- Strong title: `No expirations due`, `Nothing outstanding`, or `Nothing going cold`.
- One-line supporting explanation.
- If the feature has a clear next action, include a compact button such as `Create follow-up` or `Add member`.

Suggested tone:

- Positive and operational: `You’re all caught up.`
- Specific: explain what will appear in the area.
- Never use vague filler such as `No data found`.

A restrained float animation can be applied to the icon. Disable it for reduced-motion users.

## 11. Leads turning cold panel

This panel spans the full content width beneath the primary cards.

- Use amber for the flame icon tile because it signals attention without implying an error.
- Include a quiet summary on desktop: `0 leads need attention` with a sparkle or status icon.
- On mobile, hide or simplify the summary to preserve hierarchy.
- Keep the panel visually related to the data cards but slightly broader and calmer.

## 12. Micro-interaction standards

Apply consistent states to every interactive element:

- Resting: clear affordance, no excessive shadow.
- Hover: subtle tint, border shift, or 1–3px lift.
- Focus-visible: teal outline/ring with sufficient contrast.
- Pressed: remove lift and move down 1px.
- Disabled: reduce contrast and remove hover motion.
- Loading: use a spinner or label change; never silently disable.
- Success: use a toast with a short, specific confirmation.

Timing guidance:

- Hover/focus: 150–200ms.
- Button press: 100–140ms.
- Toast entrance: 180–240ms.
- Toast duration: approximately 2–3 seconds.

Use CSS transitions and lightweight state changes. Do not add animation libraries for basic hover/focus behavior.

## 13. Accessibility requirements

- Use semantic landmarks: `aside`, `header`, `main`, `nav`, `section`.
- Give every icon-only button an accessible name.
- Ensure form labels are associated with inputs.
- Maintain visible focus styles.
- Do not rely on color alone for status or sorting; include text, icons, or labels.
- Use `aria-live="polite"` for toast feedback.
- Respect `prefers-reduced-motion`.
- Preserve logical keyboard order and do not make decorative elements focusable.

## 15. QA checklist

Before shipping the theme:

- Confirm the desktop layout matches the intended proportions at approximately 1280px and 1440px widths.
- Check mobile layout at approximately 375px width.
- Verify all quick actions produce feedback.
- Verify global and table search update visible state.
- Verify theme switching preserves contrast and hierarchy.
- Verify sidebar active state and filtered navigation behavior.
- Verify keyboard focus and accessible names with an accessibility snapshot.
- Verify no horizontal overflow on mobile.
- Verify reduced-motion behavior.
- Capture screenshots for light desktop, dark desktop, and mobile states.

## 16. Do not do

- Do not use purple or multicolor gradients.
- Do not turn every section into a floating rounded card.
- Do not add decorative blobs, glowing orbs, or abstract filler graphics.
- Do not use more than two font families.
- Do not use raw color utilities when semantic tokens are available.
- Do not make every interaction bounce or pulse.
- Do not sacrifice table readability for visual effects.
- Do not use local-only persistence for business data; connect real data storage when the feature requires it.

The final result should feel like a polished, dependable CRM: structured enough for daily operations, distinctive enough to belong to Crown Vitality, and responsive enough that every small action feels acknowledged.
