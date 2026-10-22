---
name: Trip Split
description: Shared travel expenses for couples and groups, in any currency.
colors:
  action: "#d43f1c"
  action-deep: "#bb3516"
  person-0: "#f2c14e"
  person-1: "#86b6d9"
  person-2: "#9fcf8f"
  person-3: "#f2a0a0"
  person-4: "#b9a6e3"
  person-5: "#7fcfc4"
  person-6: "#f5ad7e"
  person-7: "#cdb88c"
  ink: "#2a2420"
  soft: "#655a50"
  placeholder: "#7a6e63"
  placeholder-amount: "#8a7d71"
  ground: "#f6efe7"
  card: "#ffffff"
  white: "#ffffff"
  sand: "#eadfd2"
  sand-hover: "#e0d2c2"
  sand-deep: "#d6c7b6"
  hairline: "#efe6db"
  row-hover: "#fbf8f4"
  disabled: "#cfc3b6"
  quiet-bar: "#c9b9a7"
  danger: "#b8321a"
  danger-wash: "#fbe9e4"
  synced: "#3f8f5a"
typography:
  display:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "clamp(28px, 8.5vw, 38px)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  amount:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  4xl:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    letterSpacing: "-0.02em"
  3xl:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    letterSpacing: "-0.01em"
  2xl:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
  xl:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
  lg:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 800
  base:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "tnum"
  md:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  sm:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
  xs:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  2xs:
    fontFamily: "Nunito, ui-rounded, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  bar: "4px"
  tile: "14px"
  card: "20px"
  sheet: "24px"
  fab: "28px"
  pill: "999px"
spacing:
  unit: "4px"
  top: "60px"
  tabs: "68px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    typography: "{typography.xl}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "54px"
  button-primary-hover:
    backgroundColor: "{colors.action-deep}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled}"
  button-add-expense:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    typography: "{typography.xl}"
    rounded: "{rounded.fab}"
    padding: "0 24px 0 18px"
    height: "56px"
  button-secondary:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink}"
    typography: "{typography.md}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.sand-hover}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "54px"
  button-outline-hover:
    backgroundColor: "{colors.hairline}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "0 18px"
    height: "54px"
  button-danger-hover:
    backgroundColor: "{colors.danger-wash}"
  button-icon:
    rounded: "{rounded.pill}"
    size: "44px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "18px 20px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.lg}"
    rounded: "{rounded.tile}"
    padding: "0 14px"
    height: "50px"
  amount-field:
    backgroundColor: "{colors.card}"
    typography: "{typography.amount}"
    rounded: "{rounded.card}"
    padding: "8px 18px 10px"
  segmented:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.soft}"
    typography: "{typography.md}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segmented-selected:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.md}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "42px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  chip-person-selected:
    backgroundColor: "{colors.person-0}"
    textColor: "{colors.ink}"
  list-row:
    textColor: "{colors.ink}"
    padding: "10px 16px"
    height: "68px"
  list-row-hover:
    backgroundColor: "{colors.row-hover}"
  bar:
    backgroundColor: "{colors.hairline}"
    rounded: "{rounded.bar}"
    height: "8px"
  bar-fill:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.bar}"
  sync-pill:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink}"
    typography: "{typography.xs}"
    rounded: "{rounded.pill}"
    padding: "5px 12px"
  sync-pill-offline:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  category-tile:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.tile}"
    size: "44px"
  avatar:
    backgroundColor: "{colors.person-0}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "32px"
  tab-bar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.soft}"
    typography: "{typography.xs}"
    height: "68px"
  tab-active:
    textColor: "{colors.action}"
---

# Design System: Trip Split

## Overview

**Creative North Star: "The Pressable Ember"**

A warm, friendly expense splitter for couples and small groups on the move. The ground is warm sand, content sits on soft white cards, and the one bright colour in the world, action orange, always marks something you can press. Everything else is ink, soft brown text, and sand. Each traveller owns a colour from a soft eight-colour person palette, and those colours carry every statement about who paid and who it was for.

Density is that of a consumer phone app used one-handed in daylight: 44px minimum targets, heavy rounded type, big money numbers, short rows. The world refuses the category default of a grey list with a green summary card, and it refuses themed costume (no travel stamps, maps, or passport motifs). Trust comes from legibility: each entry shows payer, split, and sync state without opening it.

On desktop the same world widens into two columns, list left and stats right, with the tab bar lifting into a pill in the header row.

**Key Characteristics:**
- Warm sand ground, white 20px cards, soft two-layer shadow.
- One accent, action orange, reserved for pressable things.
- Person colours that only ever speak about people.
- Nunito throughout, heavy weights (700 to 800) for anything you read at a glance.
- Tabular numerals everywhere; amounts are the loudest text on screen.
- The split badge: a pie of who owns the cost on every category tile.

## Colors

A warm, low-chroma sand-and-ink palette with one hot accent and a family of soft person colours.

### Primary
- **Action Orange** (action): Add expense, primary buttons, the active mobile tab label, and the text caret. Darkened from the sketch's #ec4a26 so white text clears 4.5:1 (4.64:1). Hover and press deepen to **Action Orange Deep** (action-deep).

### Secondary
The person palette (person-0 to person-7), one colour per traveller in trip order: **Mustard** (person-0), **Sky** (person-1), **Sage** (person-2), **Rose** (person-3), **Lavender** (person-4), **Mint** (person-5), **Apricot** (person-6), **Oat** (person-7). A trip holds up to 20 travellers; the palette wraps, so traveller n takes person-(n mod 8) and the ninth traveller shares the first one's colour. Roles: avatar fill, the selected payer segment or chip, a selected "for whom" chip, their slice of the split badge, their dot in stats and the uneven-split list. Mustard also colours text selection. Ink text sits on every one of them (7.0:1 to 9.1:1).

### Neutral
- **Warm Sand Ground** (ground): page and sheet background, sticky headers, category tile fill, gate tiles. Also the PWA theme and background colour.
- **Card White** (card): cards, inputs, the mobile tab bar, the selected segment and desktop tab. **White** (white) is the same value, kept for text on orange and ink fills.
- **Sand** (sand): secondary controls (Settle up, sync pill, segmented track), input and button strokes, icon button hover wash. Hover deepens to **Sand Hover** (sand-hover).
- **Hairline** (hairline): dividers between rows and inside cards, progress bar tracks, outline button hover, disabled input fill, row press.
- **Sand Deep** (sand-deep): hover stroke on inputs and chips.
- **Row Hover** (row-hover): the faint warm wash under a hovered list row.
- **Ink** (ink): all primary text, selected chips, the offline sync pill, progress fills, focus rings.
- **Soft Text** (soft): metadata, labels, day guide text, inactive tabs, currency symbols. 5.9:1 on the sand ground.
- **Placeholder** (placeholder) and **Amount Placeholder** (placeholder-amount): placeholder text in text fields and in the 48px amount input. The lighter amount placeholder relies on its large heavy size (4.0:1 on white).
- **Disabled** (disabled): the flat fill of a disabled primary button.
- **Quiet Bar** (quiet-bar): daily spend bars in stats at or under the per-day average; days above it stay ink.

### Semantic
- **Danger Brick** (danger): over-budget figures and bar, form errors, the Delete button text. Never a fill. Its only wash is **Danger Wash** (danger-wash), the Delete button's hover.
- **Synced Green** (synced): only the 7px dot in the Synced pill.

### Named Rules
**The Pressable Ember Rule.** Action orange appears only on things that respond to a tap. Never on headings, figures, charts, icons at rest, or decoration. If it is orange, it is pressable.

**The People Own Their Colours Rule.** Person colours mean a person and nothing else. Categories, charts not about people, and states never borrow them.

## Typography

**Display Font:** Nunito (self-hosted variable, weights 400 to 900, with ui-rounded, system-ui fallback)
**Body Font:** Nunito
**Label/Mono Font:** Nunito with tabular numerals (`font-variant-numeric: tabular-nums` on body)

**Character:** One rounded humanist family carries everything; hierarchy comes from weight and size, not from a second face. Heavy (800) for money and titles, bold (700) for labels, medium (500 to 600) for reading.

### Hierarchy
Twelve steps and nothing between them. The frontmatter weight is each step's usual weight; the role lines below are normative where they differ.
- **Display** (800, clamp(28px, 8.5vw, 38px), 1.1, -0.02em): the balance sentence ("Sam owes Alex 1 205 kr"). Balanced wrapping.
- **Amount** (800, 48px, 1.15, -0.02em): the amount input in the entry and settle sheets.
- **4xl** (800, 28px, -0.02em): gate titles, stat values, and the currency symbol beside the amount input in soft text.
- **3xl** (800, 22px, -0.01em): trip name, sheet titles, trip settings title.
- **2xl** (800, 20px): empty-state headings; the big avatar initial.
- **xl** (800, 18px): primary button and Add expense labels.
- **lg** (800, 17px): row amounts, stat section heads, gate person names; inputs at 600; desktop Add expense label.
- **base** (500, 16px, 1.4): default text. Row and trip titles at 700 with tight leading (1.25); empty-state copy at 600; stat table figures at 800.
- **md** (700, 15px): chips, segments, the secondary button, errors, desktop tabs.
- **sm** (700, 14px): field labels and legends in soft text, the day guide, links at 800, hints at 600.
- **xs** (600, 13px): row metadata (payer and split), notes, local amounts, mobile tab labels and the sync pill at 700.
- **2xs** (700, 12px): the "Not synced" chip only.

### Named Rules
**The Weight Not Case Rule.** Hierarchy is weight and size. No uppercase labels, no letter-spaced small caps.

**The On-Scale Rule.** Every size is a step on the scale. There are no half-pixel sizes; a size that falls between steps rounds up to the next one.

## Layout

Single column, max 640px, centred, with a 16px gutter on mobile. Cards sit 16px from the edges; the sticky day guide aligns its text inside the card edge (26px). A sticky top bar (60px, the `topbar` spacing token, plus safe area) holds the trip switcher and sync pill; the day guide sticks directly beneath it. The bottom of the page reserves room for the 68px tab bar (the `dock` spacing token) plus the floating Add expense button.

Rhythm is Tailwind's 4px unit: 4, 8, 12, 16 for gaps; 18px between form fields; 18 to 20px card padding; 24px desktop gutters.

One breakpoint, `wide` (60rem, 960px). From there the app becomes a two-column grid (1.25fr list, minmax(340px, 1fr) stats) inside 1120px, columns 24px apart. Stats stick beside the list; the Stats tab hides because stats are already visible. The tab bar becomes a sand pill centred in the header row, Add expense moves to the top right at 48px tall without shadow, and sheets become centred 540px dialogs with all four corners rounded.

All touch targets are at least 44px; primary actions are 54 to 56px.

## Elevation & Depth

Hybrid: a flat warm ground with lightly lifted white cards. Depth is soft and warm-tinted (shadows use ink at very low alpha), never grey or hard.

### Shadow Vocabulary
- **Card** (`shadow-card`: `0 1px 2px rgb(42 36 32 / 0.06), 0 6px 16px rgb(42 36 32 / 0.05)`): every card, the amount field, stats sections.
- **Fab** (`shadow-fab`: `0 8px 20px rgb(212 63 28 / 0.32)`): the floating mobile Add expense button only.
- **Dock** (`shadow-dock`: `0 -4px 16px rgb(42 36 32 / 0.06)`): the mobile tab bar's upward lift.
- **Lift** (`shadow-lift`: `0 1px 3px rgb(42 36 32 / 0.15)`): the chosen segment and the active desktop tab.
- **Focus** (`shadow-focus`: `0 0 0 4px rgb(42 36 32 / 0.08)`): text inputs on focus, with an ink border.
- **Stroke** (`inset-shadow-stroke`: `inset 0 0 0 1.5px` sand) and **Stroke Deep** (`inset-shadow-stroke-deep`, sand-deep): the drawn border of chips and outline buttons, and its hover.
- **Hairline** (`inset-shadow-hairline`: `inset 0 0 0 1px rgb(42 36 32 / 0.15)`): the split badge's edge.
- **Sheet scrim**: backdrop ink at 40%.

### Named Rules
**The Warm Shadow Rule.** Shadows are tinted with ink (or orange for the Add button), soft, and offset downward only. No neutral grey, no hard offsets.

## Shapes

Soft and rounded everywhere, with tiers: 14px (tile) for small squares (category tiles, inputs, trip switcher hover), 20px (card) for cards, the amount field and gate tiles, 24px (sheet) for sheet tops and the dock, 28px (fab) for Add expense. Anything that is a button, chip, segment, tag or status is a full pill. Avatars and the split badge are circles. Progress bars are 8px tall with a 4px (bar) radius. Borders are rare: 1.5px sand strokes on inputs, and the same stroke drawn as an inset shadow on chips and outline buttons; 1px hairlines between rows.

## Components

### Buttons
Tactile and soft: pills that shrink slightly on press with a springy curve (`ease-spring`, `cubic-bezier(0.2, 0.9, 0.3, 1.15)`, scale 0.95 to 0.97).
- **Shape:** full pill; Add expense 28px radius on a 56px height.
- **Primary (`btn-primary`):** action orange, white 800 text at 18px, 54px tall, 24px horizontal padding. Hover deepens to action-deep. Disabled: flat disabled fill, no press.
- **Add expense:** the floating primary, bottom right above the tab bar, with plus icon and orange glow.
- **Secondary (`btn-secondary`, Settle up):** sand fill, ink 800 text at 15px, 44px tall; hover sand-hover; disabled at 45% opacity.
- **Outline / Danger (`btn-outline`, `btn-danger`):** transparent with the 1.5px inset sand stroke; outline hovers to hairline, danger uses brick text and a danger-wash hover.
- **Icon button (`btn-icon`):** 44px circle, sand wash on hover, 35% opacity when disabled.
- **Link (`link`):** ink 800 at 14px, underlined 1.5px, offset 3px.
- **Focus:** global 2.5px ink outline, 2px offset.

### Chips
- **Style (`chip`):** white pill, 42px tall, 1.5px inset sand stroke, 700 text at 15px, optional leading 20px stroke icon.
- **State:** a pressed or checked chip inverts to ink fill with white text. A person chip fills with that person's colour and keeps ink text. Used for category choice, "for whom" (one chip per traveller plus an "Everyone" chip), and the payer picker in groups of four or more.

### Segmented Control
- **Style (`segmented`):** sand pill track with 3px padding; options are 42px pills in soft text, ellipsised.
- **State:** the selected option lifts to white with ink text and the lift shadow. In the payer control the selected option fills with that person's colour instead. The payer picker is segmented for up to three travellers and switches to wrapping chips beyond that.

### Cards / Containers
- **Corner Style:** 20px.
- **Background:** card white on the sand ground.
- **Shadow Strategy:** Card shadow (see Elevation).
- **Border:** none; internal dividers are 1px hairlines.
- **Internal Padding:** 16 to 24px, most often 18px by 20px.

### Inputs / Fields
- **Style (`field` over `input`):** 50px tall, white, 1.5px sand border, 14px radius, 600 text at 17px; label above in 700 soft text at 14px, 6px gap.
- **Hover:** border to sand-deep.
- **Focus:** border to ink plus the focus halo.
- **Disabled:** hairline fill, soft text.
- **Amount field (`amount-field`):** a borderless 48px heavy input inside a white 20px card; focus adds a 2px ink ring around the card.
- **Hint / Error (`hint`, `error`):** 600 soft text at 14px; 700 danger text at 15px.

### Expense Row
`list-row`: a grid of 44px tile, text column, right-aligned amounts; 68px minimum height, 10px by 16px padding. Title 700 at 16px ellipsised, meta line "Sam paid · split 50/50" at 13px in soft text, home amount 800 at 17px above the local amount at 13px in soft text. Hover row-hover, press hairline. A pending (unsynced) entry draws a 1.5px dashed soft-text outline inside its tile and carries a small sand "Not synced" chip with a clock icon.

### Navigation
- **Mobile:** white dock fixed to the bottom, 24px top corners, three tabs with 24px stroke icons over 13px 700 labels; inactive soft text, hover ink, active action orange.
- **Desktop:** a sand pill in the header row; tabs are horizontal 40px pills at 15px with 18px icons, the active one white with ink text and the lift shadow.
- **Top bar:** trip name (22px 800) with chevron switcher, sync pill on the right (13px 700; sand with a green dot when synced; ink with white text when offline).

### Sheets
Native dialogs rising from the bottom with 24px top corners on the sand ground, a sticky header (22px 800 title and a close icon button), and a 280ms rise-and-fade (`animate-sheet-in` on `ease-out-expo`, `cubic-bezier(0.16, 1, 0.3, 1)`). Desktop: centred, 540px wide.

### Progress Bar
`bar` holding a `bar-fill`: an 8px hairline track with a 4px radius and an ink fill set by inline width. The budget fill turns danger when over budget; stats day bars at or under the daily average use quiet-bar.

### Split Badge (signature)
An 18px circle pinned to the bottom right of every category tile, filled with a conic pie, one slice per person who shares the cost, in their colour and in proportion to their share. A 2px white ring separates it from the tile and the 1px inset ink hairline (15%) defines its edge. A 22px version without the ring sits beside the "Who is it for?" legend and updates as the split changes. The app icon is the same pie at full size.

## Do's and Don'ts

### Do:
- **Do** reserve action orange (#d43f1c) for pressable things: Add expense, primary buttons, the active mobile tab.
- **Do** show every expense's split with the split badge, in the person colours.
- **Do** put ink text on person-colour fills, never white.
- **Do** keep touch targets at 44px or more and primary actions at 54px or more.
- **Do** set money in Nunito 800 with tabular numerals, home amount first and local amount beneath in soft text.
- **Do** mark unsynced entries with the dashed tile outline and the pending chip.
- **Do** tint shadows with ink at low alpha.
- **Do** build new UI from a primitive or a token-backed utility (`card`, `chip`, `bg-sand`, `text-lg`, `rounded-tile`, `shadow-card`).

### Don't:
- **Don't** use action orange for headings, figures, chart bars, or decoration; bars and selected chips are ink.
- **Don't** use person colours for anything that is not a person.
- **Don't** fill surfaces with danger brick; it is a text and bar colour for over-budget and errors.
- **Don't** add a second typeface or uppercase letter-spaced labels.
- **Don't** use grey neutrals; every neutral is warm.
- **Don't** dress the app in travel costume (stamps, maps, passport motifs).
- **Don't** write raw hex, an arbitrary size, or a half-pixel value where a token exists.

## In Code

The system lives in one file, `src/client/styles.css` (Tailwind v4), in three layers.

1. **Tokens (`@theme`).** Every value above is a theme variable, and each one is a Tailwind class. Tailwind's defaults for colours, fonts, text sizes, radii, shadows, inset shadows and breakpoints are cleared with `initial`, so only these exist:
   - Colours: `bg-` / `text-` / `border-` with `ground`, `card`, `white`, `sand`, `sand-hover`, `sand-deep`, `hairline`, `row-hover`, `ink`, `soft`, `placeholder`, `placeholder-amount`, `disabled`, `quiet-bar`, `action`, `action-deep`, `danger`, `danger-wash`, `synced`.
   - Text: `text-2xs`, `text-xs`, `text-sm`, `text-md`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl`, `text-display`, `text-amount` (letter-spacing and line-height ride along where set). Font is `font-sans`; weights use `font-medium` to `font-extrabold`.
   - Radii `rounded-bar`, `rounded-tile`, `rounded-card`, `rounded-sheet`, `rounded-fab`, plus `rounded-pill` for pills (`rounded-full` only for circles). Shadows `shadow-card`, `shadow-fab`, `shadow-dock`, `shadow-lift`, `shadow-focus`; `inset-shadow-stroke`, `inset-shadow-stroke-deep`, `inset-shadow-hairline`. Eases `ease-spring`, `ease-out-expo`; animation `animate-sheet-in`. Breakpoint variant `wide:`. Spacing keeps Tailwind's 4px unit and adds `topbar`, `dock` and `fab-slot` (read as `var(--spacing-topbar)` and `var(--spacing-dock)` inside safe-area calcs). Containers `max-w-app` (640px), `max-w-wide` (1120px) and `w-sheet` (540px).
   - Person colours live in `@theme static` as `--color-person-0` to `--color-person-7` so they are always emitted. Screens never name them: `personColor(p)` and `personStyle(p)` in `src/client/ui/people.tsx` pick the colour (wrapping at eight) and set `--who` and `--on-who`, which `chip` and `segmented` read for their selected state.
2. **Primitives (`@utility`).** One per component above: `card`, `btn-primary`, `btn-secondary`, `btn-outline`, `btn-danger`, `btn-icon`, `link`, `chip`, `segmented`, `field`, `input`, `amount-field`, `hint`, `error`, `list-row`, `form-actions`, `bar`, `bar-fill`. They read only tokens.
3. **Screens.** Components in `src/client/` compose primitives with token-backed utilities for layout and one-off placement.

**The Token First Rule.** New UI reaches for a primitive, then a token-backed utility. Never raw hex, never an arbitrary value (`text-[15px]`, `bg-[#eadfd2]`, `rounded-[14px]`) where a token exists. Arbitrary values are for layout geometry that is not a design value: grid templates, safe-area calcs, viewport-relative offsets. A value that repeats becomes a token in `@theme` first, and lands in this file.
