# Nap or Sprint?

A small prediction arcade powered by the real Squeekchain hamster. Make a call, compete with Professor Whiskers, exchange friend duels, and collect art from real rounds. Points only; progress stays in your browser.

The finished static site is in **`dist/`**. The source is plain HTML, CSS and JavaScript with strict JSDoc type checking. Vite is a build tool; there is no frontend framework or runtime package dependency.

## Install, run and rebuild

Use Node **22.12+** (or 20.19+ on the Node 20 release line).

```sh
npm ci
npm run dev
```

To recreate and preview the production export:

```sh
npm run typecheck
npm test
npm run build
npm run preview -- --port 4173
```

Open the URL printed by Vite. Serve the entire `dist/` directory on any static host or IPFS gateway. Asset URLs are relative, and the game needs no server rewrites. There are no secrets or environment files to configure. `dist/` is deliberately included alongside its source and lockfile.

## How the game works

- The callable round is the builder anchor’s `settledThroughRound + 1`. The median spacing of recent rounds estimates the next settlement, with a 15-minute fallback. Calls auto-lock two minutes before the estimate. Each saved call keeps its original deadline. An actual oracle closure, buffered closed round or indexed settlement also closes predictions immediately.
- Selection changes are drafts until **Make my call** or **Update my call** is pressed. Unsaved changes are identified explicitly; locking always shows and uses the last saved call.
- Nap means `workAdded === 0`; Sprint means `workAdded > 0`. A sprint additionally needs a bracket: 1–10, 11–30, 31–60 or 61+ blocks. A sprint with zero completed blocks earns no bracket points.
- A right side earns 10 points; an exact sprint bracket earns 15 more. A correct call also earns `5 × current streak`, including +5 for the first correct call. Missed rounds are unscored. An incorrect side resets the streak. Professor Whiskers uses exactly the same scoring on the same rounds you play.
- Pending calls resolve in round order. Recovering an older result recomputes subsequent streaks and scores. Returning after five minutes or more can show an away summary, including when the original tab stayed open in the background.
- The weekly rivalry uses result-proof timestamps and Monday 00:00 UTC boundaries: normally the original settlement timestamp, or a recovery checkpoint’s published timestamp when the original is unavailable. The “Beat the Professor” badge requires a **completed** week ahead. The other badges are First Call, Night Owl, Hat Trick, Ten Streak, Bracket Master, Duelist, Collector and Sleep Whisperer. Night Owl uses the final prediction update time, from 00:00 inclusive to 05:00 exclusive UTC.
- Sound is synthesized with Web Audio, off by default and remembered. The three-step quick start, help panel, local-time hover text, visible keyboard focus, native dialogs and reduced-motion behavior are built in. Naps are always treated as a healthy choice.

## Live data and its limits

Only these public, key-free API endpoints are requested automatically:

```text
https://api.squeekchain.com/v1/status
https://api.squeekchain.com/v1/settlements?range=24h
https://api.squeekchain.com/v1/settlements?range=7d
```

Status refreshes every 10 seconds while the page is visible; settlement history refreshes every 30 seconds, and on return/retry. Each request has an eight-second timeout. The last good normalized response is cached in localStorage. Missing numeric fields stay unknown rather than turning into zero. An unreachable API shows an offline badge, pauses new predictions and preserves unresolved calls. A stale status is also clearly identified.

The API observed during development returns a short `recentSettlements` list and six-hour buckets for the seven-day range. The 24-hour hint therefore distributes those grouped observations over their UTC hours and labels the pattern as approximate. Whiskers blends that hourly activity (70%) with the last three known outcomes (30%), chooses a median active block bracket and explains his confidence. His forecast freezes when first observed, including across reloads. With no history, he openly falls back to a 50% prior.

Archived inactive rounds can sometimes be verified by **exact differences between consecutive public mining checkpoints**, or by the latest confirmed builder submission. A checkpoint is labeled as a checkpoint, with its real transaction link. It is never substituted for the original settlement’s artwork seed: a correct archived call can have verified points while its artwork waits for the original settlement transaction hash. When neither exact source is available, the call stays pending indefinitely; the app does not invent a result. Cached original settlements are retained for played rounds.

One settlement can cover multiple rounds. Its aggregate work and block totals decide each covered call, as requested; the reveal identifies the batch. Artwork seeds combine the original settlement hash with the individual round number, so even a batched settlement gives distinct deterministic pieces.

Live round distance is an estimate from queued open-round passes and the measurement’s cumulative distance calibration. If that calibration is missing, a clearly labeled “since first check” distance is used. When the prediction round has already closed, the live strip identifies the measurement as the current wheel round.

## Friend duels and sharing

1. Save a prediction, then select **Challenge a friend**. Creating the link locks the call early.
2. Send the challenge link. Its URL hash contains UTF-8 base64url JSON with `nickname`, `round`, `call` and `bracket`.
3. Your friend makes an independent call before closure and sends a **reply link** back. The reply includes both locked calls.
4. Open that reply in the original browser. Both browsers now hold both calls and compare the real outcome. History keeps wins, losses and draws against each nickname.

There is no shared server or automatic exchange of replies. Both sides must exchange links. Duels compare side and bracket points, leaving personal streak bonuses out of the duel comparison. Links use a friendly honor system, not authenticated identities or tamper-proof commitments.

Correct calls with an original transaction hash enter the art collection. Quiet rounds paint night skies; active rounds paint swirls whose density and colors respond to real work and blocks. The collection loads twelve pieces at a time. Downloads are **1200 × 1300 PNG cards** with the round, call, result and points. **Share on X** opens an intent and downloads the card; attach the PNG yourself. Nothing is posted automatically.

## Save, export and restore

Open the profile button to edit your nickname, export a JSON backup or preview an import. Importing requires an explicit **Import and replace progress** action; canceling keeps the current save. JSON is validated and points are reconstructed from results. Import files are limited to 8 MiB, 10,000 calls and 5,000 duel records.

Player data uses `nap-or-sprint:player:v1`; the public data cache uses `nap-or-sprint:data:v1`. Export includes calls, result proofs, forecasts, scores derived from results, duels, sent challenges, achievements, gallery seeds and preferences. Canvas images are regenerated rather than saved as large blobs. Invalid existing saves are left untouched; storage failure shows an export warning.

Storage belongs to a browser and origin. A different IPFS gateway or device has a different save: export before moving. There are no accounts, wallet connections, transactions, money, tracking, analytics or cookies. The only external pages are links you choose to open, including Sepolia Etherscan, Squeekchain and X.

## Checks and actual results

Executed on **2026-11-04** against the production export served under `/preview/`:

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed; strict `tsc --noEmit` checks the JavaScript and DOM types |
| `npm test` | **18/18 passed**: scoring, brackets, missing data, exact recovery, weeks, badges, imports, frozen forecasts and transaction provenance |
| `npm run build` | Passed; Vite 7.2.2 produced the included static export |
| `SKIP_WEBKIT=1 node scripts/validate.mjs` | **21/21 passed** in Chromium 141: real API loading, keyboard calls, locking, duels and replies, returns, downloads, sharing, import/export, offline states, closure races and collection pagination |
| Automated accessibility checks | Zero axe violations in Play, Collection, Badges, Duels at 320px, and the profile dialog |
| Pinned `taste.mjs --out test/scratch/taste` | **16/16 passed**; final rendered checks at 320, 390 and 1440px, including reduced motion |
| Static export / delivery budget | `npm run budget` checks relative assets, metadata, PNG dimensions, unwanted packaging, symlinks and the 8 MiB delivery ceiling |

The worker supplied tool executables from an isolated temporary installation; the project scripts and served `dist/` were the delivered ones. To run the browser checks after a normal install:

```sh
npx playwright install --with-deps chromium webkit
npm run validate
```

Use `SKIP_WEBKIT=1 npm run validate` for Chromium-only checking. The checker uses controlled API responses and short clock advances for settlement timing; fixtures never enter the production bundle. It also loads the real API without interception. Reports and representative screenshots are in [artifacts/validation.md](artifacts/validation.md), [interaction-results.json](artifacts/interaction-results.json) and [taste-results.json](artifacts/taste-results.json). The pinned taste probe is an assignment input, not a required build dependency.

**Verification limits:** the supplied browser launcher lacked Chrome; isolated Chromium supplied the rendered checks. WebKit could not initialize a usable headless page on this host, so Safari is unverified. Physical-device, manual screen-reader, native browser zoom, forced-colors rendering and audible speaker tests were not performed. Automated checks are local evidence, not an independent certification.

## Source map and size policy

| Path | Purpose |
| --- | --- |
| `src/app.js` | Views, forms, polling, local game flow, dialogs and keyboard/focus behavior |
| `src/engine.js`, `src/types.d.ts` | Normalization, deadlines, Professor model, scoring, duels and validated state |
| `src/art.js`, `src/visuals.js`, `src/sound.js` | Deterministic canvas cards, original pixel sprites/icons and synthesized sound |
| `src/storage.js`, `src/style.css` | Persistence and the implemented design system |
| `public/` | Local fonts/licenses, custom favicon and 1200 × 630 share image |
| `scripts/`, `test/` | Rebuildable share image, bounded preview/checks and synthetic test fixtures |
| `dist/` | Complete static export; no installation needed to serve it |

The explicit `.gitignore` path budget is **512 bytes** for the ignore file itself. `**/node_modules/`, `**/.vite/`, `**/.cache/`, `**/coverage/`, `**/*.tsbuildinfo` and `test/scratch/` have a **zero submitted-byte budget** and are excluded at every applicable depth. `dist/`, source, manifests, lockfile, fonts and runtime assets remain included. No dependency archives, registry mirror or submodule is needed.

Conservative delivered-path budgets checked by `scripts/budget.mjs`: `dist/**` 512 KiB, `public/**` 512 KiB, `src/**` 512 KiB, `scripts/**` 256 KiB, submitted `test/**` 128 KiB, screenshots 2 MiB, other artifacts 256 KiB, and root files plus licenses 512 KiB. The hard total remains **8,388,608 bytes**. The script emits an exact byte count and writes [build-manifest.json](artifacts/build-manifest.json) with hashes for every production file.

See [DESIGN.md](DESIGN.md) for the final tokens and component patterns, and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution.
