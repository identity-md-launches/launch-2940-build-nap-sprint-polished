# Nap or Sprint? design system

## Overview

An approachable arcade for people making short predictions about a real hamster. Warm cream, dark ink, outlined rounded surfaces and a custom pixel mascot carry the visual identity. The round and its call controls lead; the Professor and weekly rivalry are supporting information. There is no marketing page between the player and the game.

The source of truth is `src/style.css`, with markup in `src/app.js`, the persistent shell in `index.html`, and original illustration helpers in `src/visuals.js`. All fonts and image assets are local. This document describes the delivered implementation, not a proposed redesign.

## Colors

The implementation uses hexadecimal primitives and semantic aliases in `src/style.css:3`. Only a warm light theme is implemented (`color-scheme: light`).

| Semantic token / supporting primitive | Value | Use |
| --- | --- | --- |
| `--color-page` / `--cream-100` | `#f8f3e7` | Page background |
| `--color-surface` / `--cream-50` | `#fffcf4` | Panels, fields and dialogs |
| `--color-subtle` / `--cream-200` | `#eee8d9` | Neutral fills and unavailable data |
| `--color-ink`, `--color-outline`, `--color-action` / `--brown-900` | `#302a25` | Text, structural outlines, primary action |
| `--color-on-action` | `#fffcf4` | Primary-button text |
| `--color-muted` / `--brown-600` | `#696151` | Secondary descriptions and time labels |
| `--color-line` / `--brown-300` | `#c9c0ad` | Dividers and unselected controls |
| `--color-sprint` / `--orange-200` | `#f7b28e` | Selected Sprint |
| `--orange-100` | `#fbe1cd` | Warm notices and result consolation |
| `--color-nap` / `--violet-200` | `#dad1e8` | Selected Nap and Professor surface |
| `--violet-100`, `--violet-800` | `#eee8f4`, `#514365` | Duel surfaces and purple text |
| `--color-success` / `--green-200` | `#d4e4b2` | Scoreboard and activity |
| `--green-100`, `--color-success-ink` / `--green-800` | `#e9efd9`, `#3a4e2d` | Coach/success fills and their text |
| `--color-error` / `--red-800` | `#913b2b` | Validation text and invalid outlines |
| `--color-focus` | `#1658b3` | Three-pixel visible keyboard focus |

Nap and Sprint use distinct colors plus icons, labels and a selected check; status uses text alongside a dot. Color never carries the decision alone. The final probe measured the rendered text pairs and passed its contrast check; the accessibility scans also reported no contrast violations. No unmeasured contrast ratios are asserted here.

The mascot has its own small pixel palette: brown outlines, golden fur, cream cheeks and pink ears. Canvas artwork uses related pigments with darker night backgrounds. Those are illustration colors, not interchangeable UI state tokens.

## Typography

Two local variable faces load with `font-display: swap`:

- `--font-body`: **DM Sans**, then `sans-serif`, declared weights 400–700; `public/fonts/dm-sans-latin.woff2`.
- `--font-display`: **Bricolage Grotesque**, then `sans-serif`, declared weights 400–800; `public/fonts/bricolage-grotesque-latin.woff2`.

The UI uses three weights: 400 for prose, 600 for routine controls and labels, 700 for headings, call choices and primary emphasis. Chromium verified both intended fonts loaded.

| Token | Size | Main roles |
| --- | --- | --- |
| `--text-xs` | 12px / .75rem | Metadata, hints, dates, count indicators |
| `--text-sm` | 14px / .875rem | Nav, secondary controls, descriptions |
| `--text-base` | 16px / 1rem | Body, fields, main call button |
| `--text-lg` | 20px / 1.25rem | Component titles |
| `--text-heading` | 28px / 1.75rem | View titles, countdowns, call names, scores |
| `--text-display` | 64px; 48px at ≤48rem; 44px at ≤23rem | Game title and large reveal points |

There are six distinct sizes per measured viewport. Headings use 1.15 line height and balanced wrapping; the main title uses −.05em tracking, component headings −.025em or −.015em. Body copy uses 1.5, with help and explanatory text at 1.6–1.7. Most long descriptions are constrained to 43–48ch. Times and changing numbers use tabular numerals. Inputs stay at least 16px. Critical nicknames wrap instead of being ellipsized.

## Layout

`--space-1` through `--space-7` declare 4, 8, 12, 16, 24, 32 and 48px steps. Components currently also use literal spacing values from that scale, with 14, 18, 20 and 22px optical insets. Preserve the larger gaps between groups than within them.

`.site-shell` has a maximum width of 1248px including 40px side padding. The desktop `.game-grid` is flexible game content plus a 336px sidebar with a 24px gap. The main call card contains, in order, the round/countdown, wheel, distance, call choices and action, then the optional coach. The action is before the coach in the DOM and visually.

| Breakpoint | Implemented adaptation |
| --- | --- |
| ≤62rem (992px) | Shell padding 28px; sidebar 290px; 20px game gap; compact choice typography |
| ≤48rem (768px) | Shell padding 24px; game becomes one column; Professor and scoreboard share a row; gallery and badges use two columns |
| ≤36rem (576px) | Shell padding 18px; sidebar stacks; 152px wheel scene; 70px header; gallery becomes one column; badges retain two columns |
| ≤23rem (368px) | Shell padding 14px; 44px title; smaller choice titles and nav labels; secondary refresh note is hidden |

Navigation stays in normal flow; there is no fixed bottom bar covering the game. Dialogs fit the viewport with internal scrolling. The gallery initially paints twelve canvases, and “Show more” reveals additional pieces while moving keyboard focus to the new items. Filters reset the batch size. The call log shows recent matches while exports retain all saved calls.

Rendered reflow was checked at 320, 390, 820 and 1440px. The 390 × 844 first screen contains the game and complete call button, whose bottom measured 727px. Native browser zoom and physical devices remain unverified; see validation coverage.

## Elevation & Depth

This is a flat, outlined interface. `--border` is `2px solid --color-outline`; panels and control states establish structure without drop shadows. The primary button has a thicker 5px bottom border for its chunky feel. Dialogs use a translucent brown backdrop (`#302a257a`) with a 3px backdrop blur; the toast is a dark solid surface. There is no gradient text or glow system.

Wheel scenery and generated artwork are intentionally clipped within their media areas. Informational text stays in normal layout. The decorative moon sits below the RPM label’s reserved top corner.

## Shapes

`--radius` is 22px for primary panels. `--radius-small` is 12px for buttons. Call choices use 14px on desktop and 12px on phones; fields use 10px, artwork and badge cards 18px, and dialogs 24px (20px on phones). Avatars and status dots are circular. Badge illustrations use a rounded 28px tile, with a small deliberate rotation; phone tiles are 68px with a 22px radius.

## Components

| Pattern | Source and behavior |
| --- | --- |
| Primary/secondary/text/icon buttons | `src/style.css`: `.primary-button`, `.secondary-button`, `.text-button`, `.icon-button`. Primary actions are dark filled; secondary actions outlined; link-like actions underlined. Most actions are ≥44px high, main submit 50–52px. Compact header and inline links use the measured spacing baseline. |
| Prediction card | `renderRound()` in `src/app.js`. Native labeled radio groups with visible selected checks. Sprint reveals its bracket group. Form errors announce and focus the field; actual closure and fixed deadlines disable or remove unavailable calls. |
| Live wheel | `wheelScene()` and `hamster()` in `src/visuals.js`. Original pixel sprites and SVG wheel/scenery. Known positive RPM sets rotation speed; idle curls up with Zs; stale readings freeze motion and say “Last seen”. Unknown fields are labeled. |
| Professor and scoreboard | `renderProfessor()`, `renderScoreboard()`. Fixed forecast, percentage confidence, disclosed model, local matched-round scores and changing score-dependent quote. Expanded model text and keyboard focus survive polling. |
| Activity strip | `renderActivity()`. Twenty-four UTC columns, outlined current hour, tooltips and a full textual accessible description. Grouped history is explicitly approximate. |
| Gallery and cards | `renderGallery()`, `src/art.js`. Filter buttons expose pressed state; native buttons open the art dialog. Fixed-coordinate canvas artwork uses the original transaction hash plus round number, with work/block-driven color and density. PNG generation happens on demand. |
| Illustrated badges | `renderAchievements()` and `ACHIEVEMENTS` in `src/engine.js`. One consistent SVG icon set, title, requirement and textual locked/earned state. New achievements enter the polite toast queue. |
| Duels | `renderDuels()`, `showLink()`. Locked call summaries, selectable links, explicit reply flow, outcomes and per-nickname records. No implication of server synchronization. |
| Dialogs and settings | Native `<dialog>` in `index.html`, helpers in `src/app.js`. Modal focus containment, Escape/backdrop close and focus return. Profile has nickname, export, validated import preview and explicit replacement confirmation. |
| Notices and toast | `.notice` and `toast()` in `src/app.js`. Loading, offline, partial history, away summaries, input recovery and storage warnings. Stable polite live regions carry short confirmations, switching to the dialog’s top layer while a modal is open so notifications stay visible. |

All icons use one inline outline set from `icon()` with `currentColor` and decorative ARIA hiding. The custom favicon is `public/favicon.svg`; the share image is `public/og-image.png`, rebuilt with `scripts/make-social.mjs`.

Motion is limited to CSS transforms/opacity and the live wheel. Press feedback uses `scale(.96)`, short transitions use 150ms and `cubic-bezier(.2,0,0,1)`, and the result reveal lasts 500ms. `prefers-reduced-motion: reduce` removes all animations and transitions, including continuous wheel/Z motion, and removes smooth scrolling. Static labels preserve every state.

## Do’s and Don’ts

- Start another view inside the existing `.site-shell` and `.view-nav`; reuse `.view-title`, `.panel`, button and empty-state patterns.
- Keep the current round and its meaningful action early in reading order. Put instructions next to the controls.
- Use the six-size scale and existing font weights. Use semantic color roles for text and actions, and the category fills for Nap/Sprint.
- Reuse native controls and dialogs, visible keyboard focus, explicit state text and recoverable errors. Preserve focus when live data rerenders a view.
- Keep decorative SVG away from live labels. Use original public result hashes for art; a missing seed remains missing.
- Keep naps kind, the Professor lightly smug and error messages calm. Do not add running pressure, money language, fabricated players or fake live numbers.
- Keep runtime assets local and URLs relative. A new view should need no heavy framework, wallet infrastructure, server route or tracking service.

Design guidance attribution and licenses are recorded in `THIRD_PARTY_NOTICES.md` and `licenses/design-guidance.txt`.
