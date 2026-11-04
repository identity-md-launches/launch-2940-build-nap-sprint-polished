# Third-party notices

The pixel hamster sprites, wheel scene, icons, generative artwork code and game interface were created for this assignment.

## Fonts

- **Bricolage Grotesque** — Copyright 2022 The Bricolage Grotesque Project Authors. [Project](https://github.com/ateliertriay/bricolage). SIL Open Font License 1.1, included in `public/fonts/Bricolage-OFL.txt` and the static export.
- **DM Sans** — Copyright 2014 The DM Sans Project Authors. [Project](https://github.com/googlefonts/dm-fonts). SIL Open Font License 1.1, included in `public/fonts/DM-Sans-OFL.txt` and the static export.

The local Latin variable WOFF2 assets were obtained from the Google Fonts distribution. They make no runtime request to Google.

## Design and documentation guidance

The pinned Better Interface principles were applied while building and reviewing this game. Guidance is adapted from **Jakub Krehel’s Better Interface**, MIT, commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`: [source](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface).

The design-documentation method is adapted from **Paul Bakaus’s Impeccable**, Apache-2.0, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`: [source](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md).

Both license texts are retained in `licenses/design-guidance.txt`. The pinned guides were knowledge inputs; they are not runtime dependencies.

## Build and check tooling

Vite, TypeScript, Playwright and axe are development dependencies, recorded in `package.json` and `package-lock.json`. Their packages retain their own notices when installed. No dependency implementation or package-manager archive is vendored into the static game.
