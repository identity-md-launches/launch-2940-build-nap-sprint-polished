// @ts-check
/** A single outline icon set, all decorative when paired with control text. @param {string} name @param {string} [className] */
export function icon(name, className = '') {
  /** @type {Record<string, string>} */ const paths = {
    moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
    bolt: '<path d="m13.5 2-9 12h6L9.5 22l10-13h-6l1-7Z"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>',
    external: '<path d="M14 3h7v7m0-7-11 11m0-9H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
    sound: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 5 6m-5 0 5-6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2.5m0 3h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    art: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-4 4 3 4-6 5 7"/>',
    flag: '<path d="M5 22V3c5-5 9 5 14 0v12c-5 5-9-5-14 0"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a5 5 0 0 0 5 5m7-8h4v3a5 5 0 0 1-5 5m-3 0v6m-4 2h8m-7-2h6"/>',
    swords: '<path d="m4 3 3 1 13 15-3 2L4 6V3Zm16 0-3 1-6 7m-4 3-4 5 3 2 4-5m-7 1 4 4m10-4 4 4"/>',
    hat: '<path d="m2 9 10-6 10 6-10 6L2 9Zm4 3v5c4 4 8 4 12 0v-5m4-3v9"/>',
    flame: '<path d="M12 2c2 6 8 7 8 13a8 8 0 0 1-16 0c0-4 3-6 4-9 0 4 2 5 3 5 2-3 2-5 1-9Z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    glasses: '<circle cx="6" cy="14" r="4"/><circle cx="18" cy="14" r="4"/><path d="M10 14h4M2 12l2-8h3m15 8-2-8h-3"/>',
    sleep: '<path d="M3 4h6l-6 7h6m5 2h7l-7 8h7"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    share: '<path d="M12 16V3m-5 5 5-5 5 5M5 12H3v9h18v-9h-2"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5m10-4a8 8 0 0 0-14-3L4 7m16 10-1 2a8 8 0 0 1-14-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    heart: '<path d="M12 21 3.5 12.5a5.5 5.5 0 0 1 8-7.5l.5.5.5-.5a5.5 5.5 0 0 1 8 7.5L12 21Z"/>',
    spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] ?? paths.spark}</svg>`;
}

/** Original pixel sprite. @param {'awake'|'sleep'|'professor'} [kind] @param {string} [className] */
export function hamster(kind = 'awake', className = '') {
  const rows = kind === 'sleep' ? [
    '............................', '............................', '............................',
    '.........####...............', '........#pppp#..............', '.....####pttp####...........',
    '....#tttttttttttt##.........', '...#ttttttttttttttt#........', '..#ttttttttttttttttt#.......',
    '.#ttttttttttttttttttt#......', '.#ttttttttttttttttttt#......', '.#ttttttttttttttttttt#......',
    '.#ttttttttttttttttttt#......', '.#tttttttttccccccccctt#.....', '.#ttttttttccccccccccct#.....',
    '..#ttttttcc##cccc##ccct#....', '..#tttttcccccpcpcccccct#....', '...#ttttcccccc#cccccctt#....',
    '....#ttttccccccccctttt#.....', '.....##tttttttttttt##.......', '.......############.........',
  ] : [
    '......####......####........', '.....#pppp#....#pppp#.......', '....#ppttpp#..#ppttpp#......',
    '....#pttttp####pttttp#......', '....#tttttttttttttttt#......', '...#tttttttttttttttttt#.....',
    '..#tttttttttttttttttttt#....', '.#tttttttttttttttttttttt#...', '.#tttttcccttttttcccttttt#...',
    '.#ttttc##ccttttc##cctttt#...', '.#ttttc#occttttc#occtttt#...', '.#ttttcccccttttccccctttt#...',
    '.#tttttppccccccccppttttt#...', '..#tttpppccc##cccpppttt#....', '..#tttcccccc##ccccccttt#....',
    '...#ttccccccc#cccccctt#.....', '...#ttcccccc###ccccctt#.....', '..#tttccccccccccccccttt#....',
    '..#tttccccccccccccccttt#....', '...#ttccccccccccccctt#......', '....#ttttccccccccttt#.......',
    '.....#ttttttttttttt#........', '....#ppp########ppp#........', '....####........####........',
  ];
  /** @type {Record<string, string>} */ const palette = { '#': '#302a25', t: '#d99960', c: '#ffe8bd', p: '#edb3a6', o: '#fff9ea' };
  let pixels = '';
  rows.forEach((row, y) => [...row].forEach((p, x) => { if (palette[p]) pixels += `<rect x="${x}" y="${y}" width="1" height="1" fill="${palette[p]}"/>`; }));
  const glasses = kind === 'professor' ? '<path d="M5 8h7v5H5V8Zm11 0h7v5h-7V8Zm-4 2h4M2 9h3m18 0h3" fill="none" stroke="#302a25" stroke-width="1.5"/><path d="m10 21 4 2-4 2v-4Zm8 0-4 2 4 2v-4Z" fill="#73628e"/><rect x="8" y="1" width="12" height="2" fill="#302a25"/><path d="M10 1V-2h8v3" fill="#73628e"/>' : '';
  return `<svg class="pixel-hamster ${className}" viewBox="0 -2 28 29" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${pixels}${glasses}</svg>`;
}

/** @param {boolean} spinning @param {number | null} rpm */
export function wheelScene(spinning, rpm) {
  const moving = spinning && rpm !== null && rpm > 0;
  return `<div class="wheel-scene ${spinning ? moving ? 'is-spinning' : 'is-paused' : 'is-napping'}" style="--wheel-duration:${rpm && rpm > 0 ? Math.max(0.35, 60 / rpm) : 1}s" aria-hidden="true">
    <svg class="scene-scenery" viewBox="0 0 720 220" preserveAspectRatio="xMidYMid slice" fill="none">
      <path d="M0 194c120-20 180 10 300 0s270-5 420 0v26H0Z" fill="#dfdfc7"/>
      <g stroke="#c4c3aa" stroke-width="2"><path d="M31 195h72m48 10h42m327-9h80m40 9h29"/></g>
      <g fill="#ada4c1"><path d="M189 40h4v4h-4zM570 48h4v4h-4zM623 106h4v4h-4zM122 102h3v3h-3zM507 115h3v3h-3z"/></g>
      <path d="M557 70a22 22 0 1 0 25 32 24 24 0 0 1-25-32Z" fill="#f7e6ae" stroke="#81738d" stroke-width="2"/>
      <g stroke="#737b50" stroke-width="4"><path d="M91 197v-40m0 22c-17-2-20-10-20-17 13-2 18 6 20 10m0 15c15-4 19-12 16-21-10 1-15 6-16 14M604 198v-23m0 9c-12-1-15-6-14-12 9-1 12 3 14 9m0 9c10-3 13-8 11-14-7 1-10 5-11 10"/></g>
      <g fill="#f5b39e" stroke="#302a25" stroke-width="1.5"><path d="M153 196v-8h4v-4h8v4h4v8z"/><path d="M553 197v-5h3v-3h6v3h3v5z"/></g>
    </svg>
    <div class="wheel-assembly"><svg class="wheel-frame" viewBox="0 0 220 220"><path d="m95 108-23 98m53-98 23 98M57 209h106" fill="none" stroke="#302a25" stroke-width="7" stroke-linecap="round"/><circle cx="110" cy="100" r="89" fill="#f4f0e5" stroke="#302a25" stroke-width="5"/><g class="wheel-rotor" fill="none" stroke="#a79cba" stroke-width="3"><circle cx="110" cy="100" r="78"/><path d="M110 22v156m-78-78h156M55 45l110 110M55 155 165 45"/><circle cx="110" cy="100" r="6" fill="#302a25" stroke="#302a25"/></g><path d="M40 150a82 82 0 0 0 140 0" fill="none" stroke="#302a25" stroke-width="4"/></svg>
      <div class="wheel-hamster ${moving ? 'hamster-running' : ''}">${hamster(spinning ? 'awake' : 'sleep')}</div>
      ${spinning ? '<span class="wheel-motion">↗</span>' : '<span class="sleep-z z-one">z</span><span class="sleep-z z-two">z</span>'}
    </div>
  </div>`;
}
