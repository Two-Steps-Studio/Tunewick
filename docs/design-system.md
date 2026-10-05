# Design System

> Status: **v0.1 — logo concept A "Wick" chosen by owner (2026-10-05)** (Guidon: "Phase 2: Brand & design system").
> Tokens: [`design/tokens.css`](../design/tokens.css) · Visual board: [`design/brand-board.html`](../design/brand-board.html)
> (run `npx serve design` and open `/brand-board.html`).

## 1. Identity in one line

**Editorial poster for a local scene, not a dashboard.** Big condensed type, flat color fields,
square edges, a single acid-lime spark of action. It should feel closer to a gig poster or a
record sleeve than to a SaaS product or a streaming clone.

| Tunewick is | Tunewick is not |
| --- | --- |
| simple, confident, editorial, slightly experimental | generic SaaS, crypto, AI startup |
| typographic hierarchy, asymmetric layouts | rows of identical rounded cards |
| artwork-driven, flat color | glassmorphism, gradients-as-decoration |
| honest data (quality, stats) shown plainly | badges that overstate |

**Anti-clone checks:** no green-on-black (Spotify), no rounded pastel cards and frosted glass
(Apple Music), no all-black-and-white minimalism with cyan accents (Tidal). Graphite + acid lime
with ivory and square geometry is distinct from all three.

## 2. Tool and source used

The Master Prompt requires `emilkowalski/skill`. It is installed in the repo
(`npx skills add emilkowalski/skill` → `.agents/skills/`, pinned in `skills-lock.json`; 14 skills).
Applied mainly from `emil-design-eng` (motion decisions, press feedback, easing, performance,
reduced motion), with `animate`, `review-animations`, `mobile-native` and `break-ui` available
for implementation and review. Where the skill conflicts with Tunewick branding, accessibility or
performance, Tunewick wins. Examples in the skill are not copied as visual style.

## 3. Color

### Primitives

| Token | Hex | Role |
| --- | --- | --- |
| `--tk-graphite` | `#171515` | base background (dark theme), text (light) |
| `--tk-ivory` | `#F2EBDD` | text (dark), base background (light) |
| `--tk-lime` | `#D8FF3E` | **the one action color**: play, primary action, the spark |
| `--tk-coral` | `#FF5C5C` | "now / live": live events, currently playing marker, destructive |
| `--tk-purple` | `#7657FF` | scenes, events, graph relations (large areas and graphics) |

### Accessible text variants

| Token | Hex | Contrast | Use |
| --- | --- | --- | --- |
| `--tk-purple-light` | `#9580FF` | 5.90 on graphite | purple text on dark |
| `--tk-purple-deep` | `#5B3EF0` | 5.22 on ivory | purple text on light |
| `--tk-coral-deep` | `#B83232` | 5.00 on ivory | coral text on light |
| `--tk-lime-deep` | `#4E6600` | 5.49 on ivory | lime-meaning text on light |

Measured contrast (WCAG 2.x): ivory/graphite 15.33, lime/graphite 15.84, coral/graphite 6.01,
**purple/graphite 3.96 → not allowed for body text** (≥3:1 OK for large text and UI graphics),
coral/ivory 2.55 → not allowed for text.

### Rules
1. **Lime is rare.** One primary lime element per view region (play, primary CTA). If everything is lime, nothing is.
2. **Coral never means "error-only".** It means *now*: live, playing, happening tonight. Errors use coral + icon + text, never color alone.
3. **Purple belongs to the scene layer:** events, venues, cities, graph links. It helps users learn "purple = out in the world".
4. Artwork provides the rest of the color. UI chrome stays graphite/ivory so covers carry the page.
5. Dark theme is the default (listening context, OLED); light theme is first-class, not an afterthought.

### Semantic tokens

Components use only semantic tokens: `--bg`, `--bg-raised`, `--bg-sunken`, `--line`, `--text`,
`--text-muted`, `--accent`, `--on-accent`, `--signal`, `--scene`, `--focus`. Both themes are
defined in `design/tokens.css`. In light theme `--accent` is graphite with lime text (lime
fills on ivory are kept for large brand moments only).

## 4. Typography

| Role | Typeface | License | Why |
| --- | --- | --- | --- |
| Display | **Bricolage Grotesque** (variable: opsz, wdth 75–100, wght 200–800) | SIL OFL | Contemporary grotesk with character at large sizes, condensed widths for poster-like headlines; not Inter/Helvetica. |
| Text / UI | **Instrument Sans** (variable: wdth 75–100, wght 400–700) | SIL OFL | Clean, slightly narrow, excellent at small sizes; width axis keeps dense lists compact. |
| Data | **Martian Mono** (variable: wdth, wght) | SIL OFL | Technical readouts: codec, bit depth, sample rate, durations, dates. Gives audio data its own voice. |

All three cover Polish diacritics (verified in the board: "Zażółć gęślą jaźń"). OFL allows web
embedding and app bundling. **Self-host** in production (no Google Fonts requests → GDPR and
performance); the board uses Google Fonts only as a preview.

### Scale (tokens)
`xs 12 · sm 14 · base 16 · lg 18 · xl 20–24 · 2xl 24–36 · 3xl 32–56 · display 44–96` (fluid via `clamp`).

### Rules
- Headlines: Bricolage 750–800, `wdth 75`, tracking −0.02 to −0.045em, line-height 0.85–0.95.
- Body: Instrument Sans 400, line-height 1.5, max 62ch.
- Numbers in data contexts use Martian Mono; never fake precision (e.g. no "96 kHz" unless true).
- Minimum UI text 12px; muted text only on tokens that pass 4.5:1.

## 5. Logo

Direction from the Master Prompt: abstract geometric TW, 2–4 elements, asymmetry, one broken
element, strong at small sizes, no notes/headphones/waveforms/equalizers/play buttons.

### Symbol concepts (see board)

**A — "Wick"** (recommended)
- A short T crossbar + one continuous zigzag stroke whose first stroke is the T stem and the rest forms W.
- A detached lime square above the last stroke — the "spark" of the wick (*tune + wick*). That is the broken element.
- 3 elements. Reads at 16px as a mark with a lime dot; the spark is the brand's recurring motif.

**B — "Split"**
- T crossbar and stem separated by a gap (broken element); W as a coral zigzag set apart from the stem, last arm rising above the baseline.
- 3 elements. Stronger "TW" letter reading, less ownable as a motif.

### Wordmark
- `tunewick`, lowercase, Bricolage Grotesque 800, `wdth 85`, tight tracking.
- The dot of the **i** is replaced by the **square spark** (lime on graphite, coral or graphite on ivory/lime).
- Follow-up (separate task): custom-drawn **k** and **w**, outline the wordmark to SVG paths so it no longer depends on the font.

### Usage rules
- Spark color: lime on graphite; coral or graphite on ivory (lime on ivory is invisible); graphite on lime.
- Clear space: the height of the T crossbar on all sides.
- Minimum size: symbol 16px, wordmark 72px wide.
- Never place on busy artwork without a solid field.

**Decision (2026-10-05): concept A "Wick".**

### Production assets (`design/logo/`, generated by `node design/logo/build-logo.mjs`)

| File | Use |
| --- | --- |
| `tunewick-symbol-on-dark.svg` / `-on-light.svg` / `-on-lime.svg` / `-mono.svg` | Symbol variants with the spark color rules applied |
| `tunewick-wordmark-on-dark.svg` / `-on-light.svg` / `-mono.svg` | Wordmark outlined to paths (no font dependency) |
| `apps/web/src/app/icon.svg`, `favicon.ico` (16/32/48), `apple-icon.png` (180) | Browser and iOS icons (symbol on a graphite square) |
| `apps/web/public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | PWA manifest icons (maskable keeps the symbol in the 80% safe zone) |
| `apps/web/src/components/shell/wordmark-data.ts` | Wordmark path data for the in-app SVG component |

Wordmark build parameters: Bricolage Grotesque wght 800, wdth 85, opsz 96, tracking −0.02em
(looser than the −0.045em on the brand board so letters never touch at small sizes).
The symbol stays legible at 16 px (verified). Custom-drawn **k** and **w** remain a follow-up.

## 6. Layout

- **Editorial grid:** 12 columns desktop, 4 mobile, 16px mobile gutter. Content is placed asymmetrically (e.g. 2fr / 1fr, 1.4fr / 1fr / 1fr), not evenly split card rows.
- **Hierarchy through type and space, not boxes.** Sections are separated by hairlines (`--line`) and large spacing (64–96px), not by containers.
- **Artwork leads.** Release and artist pages open with large artwork and display type; metadata sits in a narrow column.
- **Square geometry.** Radius 0 by default, 2px for inputs/chips. The only round elements: the play control and toggles — round = "plays/turns".
- **Scene rule:** event, venue and city items carry a 3px purple top rule instead of a card frame.
- Mobile first: bottom player bar + bottom nav; no horizontal page scroll; safe-area insets.

## 7. Motion

Motion is subtle, quick and has a reason. Values from `design/tokens.css`:

| Token | Value | Use |
| --- | --- | --- |
| `--tk-ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | entering elements, press feedback |
| `--tk-ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | on-screen movement/morph |
| `--tk-ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | full player sheet, drawers |
| `--tk-dur-press` | 140ms | `:active` scale(0.97) on pressables |
| `--tk-dur-fast` | 180ms | popovers, menus, hovers |
| `--tk-dur-base` | 240ms | panels, toasts |
| `--tk-dur-sheet` | 380ms | full-screen player sheet |

Rules (from `emil-design-eng`, adapted):
1. **Frequency decides.** Things used hundreds of times (play/pause, next, keyboard shortcuts, queue reorder by keyboard) get no decorative animation — only instant state change and press feedback.
2. Never `ease-in` for UI; never animate from `scale(0)` (start ≥0.95 + opacity).
3. Only `transform` and `opacity` (and `clip-path` where needed). No layout-property animation.
4. CSS transitions over keyframes for interruptible UI; springs only for gestures (player sheet drag, swipe to dismiss) with bounce ≤0.2.
5. Popovers scale from their trigger; modals stay centered.
6. Exit faster than enter.
7. Hover effects only under `@media (hover: hover) and (pointer: fine)`.
8. `prefers-reduced-motion`: remove movement, keep short opacity/color transitions.

**Musical motion (Tunewick-specific, used sparingly):** the spark may pulse once on play start
(single 240ms scale 1→1.15→1, not looping). No beat-synced visualizers, no constant motion
in the UI chrome — the music is the moving part.

## 8. Components — language (initial set)

| Component | Tunewick treatment |
| --- | --- |
| **Quality indicator** | Always two cells: **source** → **delivered** (e.g. `FLAC 24/96 → FLAC 24/48 · browser limit`). Lime fill only when delivered is lossless relative to source. Downgrades shown in muted text with `↓` and a reason. Never displays values the playback path does not guarantee. Martian Mono. |
| Play control | The only filled round element, lime, 56px (44px min hit area everywhere). |
| Buttons | Square, primary = lime fill, secondary = 1px inset line. Press scale 0.97. |
| Event item | Purple 3px top rule, oversized condensed date, title, venue · city. No card box. |
| Artist / release tile | Square artwork, no radius, title below in display type; hover reveals nothing essential. |
| Soundcheck | Artwork + 30s progress as a straight line under it (not a waveform), artist name, "full track" and "next gig" links. |
| "Byłem przy tym" | A stamp-like mark (square, date in mono) in the user's history — a memory, not a counter. |
| Recommendation reason | One line of muted text under the item: "Played at … · Same producer as …". |
| Promotion label | Explicit "Promoted" text label, never color-only (anti-payola). |

Full component specs come with the UI implementation tasks.

## 9. Iconography and imagery

- Icons: 1.5px stroke, square caps, 24px grid; custom set where it matters (spark, scene, "I was there"); generic UI icons from an open set (e.g. Lucide, ISC) restyled to square caps.
- No stock "headphones person" photography. Artist-supplied artwork and real event photos only.
- No generated imagery presented as real artists, venues or events.

## 10. Accessibility

- WCAG 2.2 AA minimum: text 4.5:1, large text/UI 3:1 (all token pairs above are measured).
- Visible focus: 2px outline in `--focus` with 3px offset; never removed.
- Full keyboard control of the player (space, arrows, shortcuts documented), with no animation on keyboard actions.
- Screen readers: player state announced (track, artist, quality as words: "lossless, 24-bit, 48 kilohertz").
- Touch targets ≥44px; reduced motion respected; color never the only signal.

## 11. Internationalization

Polish and English from day one. Condensed display type must handle longer Polish words — test
headlines with real Polish strings ("Wydarzenia w ten weekend", "Byłem przy tym").

## 12. Open items

| Item | Status |
| --- | --- |
| Logo concept choice | ✅ A "Wick" |
| Final vector logo, favicon, PWA icons | ✅ done (design/logo) |
| Custom k / w in wordmark, outlined SVG | follow-up task |
| Self-hosted font files + subsetting | implementation (Phase 5+) |
| Full component library specs | with UI tasks |
