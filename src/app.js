// @ts-check
import { API, MINUTE, DAY, ACHIEVEMENTS, BRACKETS, normalizeStatus, normalizeHistory, anchorSettlement, mergeSettlements, roundWindow, makeRival, reconcile, weekStart, weekScore, hourlyPattern, blockBracket, duelResult, cleanNickname, encodeChallenge, decodeChallenge, validateState, validHash, hasArtworkSeed, settlementForRound } from './engine.js';
import { loadState, loadCache, saveState, saveCache, storageIssue } from './storage.js';
import { icon, hamster, wheelScene } from './visuals.js';
import { paintArt, makeArtCard, downloadBlob } from './art.js';
import { playSound } from './sound.js';
/** @typedef {import('./types').Call} Call */
/** @typedef {import('./types').Challenge} Challenge */
/** @typedef {import('./types').Settlement} Settlement */

/** @param {string} id @returns {HTMLElement} */
function el(id) { const element = document.getElementById(id); if (!element) throw new Error(`Missing element: ${id}`); return element; }
/** @param {unknown} value */
function escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c)); }
/** @param {number | null | undefined} value @param {number} [digits] */
function number(value, digits = 0) { return value === null || value === undefined ? '—' : value.toLocaleString('en', { maximumFractionDigits: digits }); }
/** @param {number} time @param {boolean} [date] */
function utc(time, date = false) { return new Date(time).toLocaleString('en-GB', { timeZone: 'UTC', ...(date ? { day: 'numeric', month: 'short' } : {}), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' UTC'; }
/** @param {number} time @param {boolean} [date] */
function timeElement(time, date = false) { return `<time datetime="${new Date(time).toISOString()}" title="Your local time: ${escape(new Date(time).toLocaleString())}">${utc(time, date)}</time>`; }
/** @param {import('./types').Side} side @param {import('./types').Bracket | null} [bracket] */
function callText(side, bracket = null) { return `${side === 'NAP' ? 'Nap' : 'Sprint'}${side === 'SPRINT' && bracket ? ` · ${bracket} blocks` : ''}`; }
/** @param {Settlement} s */
function explorer(s) { return validHash(s.hash) ? `https://sepolia.etherscan.io/tx/${s.hash}` : ''; }
/** @param {number} round @returns {Settlement | undefined} */
function settlementFor(round) { return settlementForRound(round, allSettlements()); }
function allSettlements() { return mergeSettlements(state.calls.flatMap(c => c.result ? [c.result.settlement] : []), cache.settlements, Infinity); }

let state = loadState();
let cache = loadCache();
const loadedLastSeen = state.lastSeen;
let view = 'play';
let filter = 'all';
let galleryLimit = 12;
let historyFilter = 'all';
let connection = cache.status ? 'cached' : 'loading';
let historyError = false;
let refreshing = false;
let firstRefresh = true;
let lastHistoryAttempt = 0;
let backgroundAt = 0;
let resumedAfterAway = false;
let formError = '';
let incoming = decodeChallenge(location.hash);
/** @type {{round:number,side:import('./types').Side|null,bracket:import('./types').Bracket|null}} */
let draft = { round: 0, side: null, bracket: null };
/** @type {Call[]} */ let awayCalls = [];
/** @type {import('./types').State | null} */ let importCandidate = null;
/** @type {Element | null} */ let dialogTrigger = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */ let toastTimer;
/** @type {{title:string,detail:string,icon:string}[]} */ const toastQueue = [];
let toasting = false;
const dialog = /** @type {HTMLDialogElement} */ (el('game-dialog'));
const content = el('view-content');

function currentWindow() {
  const w = roundWindow(cache.status, cache.settlements);
  const existing = state.calls.find(c => c.round === cache.status?.round);
  return existing ? { round: existing.round, interval: w?.interval ?? 15 * MINUTE, expectedAt: existing.expectedAt, lockAt: existing.lockAt } : w;
}
/** @param {Call} c */
function hasDraftChanges(c) { return draft.round === c.round && draft.side !== null && (draft.side !== c.call || (draft.side === 'SPRINT' ? draft.bracket : null) !== c.bracket); }
function isStale() { return !cache.status || Date.now() - cache.status.generatedAt > 2 * MINUTE || Date.now() - cache.statusAt > 2 * MINUTE; }
function isConnected() { return connection === 'online' && !isStale(); }
/** The anchor, closure and history endpoints can advance at different moments. @param {number} round */
function knownClosed(round) { return Boolean((cache.status?.round ?? 0) > round || (cache.status?.closure ?? 0) >= round || (cache.status?.buffered ?? 0) >= round || settlementForRound(round,cache.settlements)); }
function canPredict() { const w = currentWindow(); return Boolean(w && Date.now() < w.lockAt && !knownClosed(w.round) && isConnected()); }
function currentCall() { return state.calls.find(c => c.round === cache.status?.round); }
function currentRival() { return state.rivals.find(r => r.round === cache.status?.round) ?? currentCall()?.rival; }

function persist() {
  state.lastSeen = Date.now(); saveState(state);
  el('storage-warning').hidden = !storageIssue;
  el('storage-warning').textContent = storageIssue;
}
/** @param {string} title @param {string} [detail] @param {string} [symbol] */
function toast(title, detail = '', symbol = 'check') {
  toastQueue.push({ title, detail, icon: symbol });
  if (!toasting) nextToast();
}
function nextToast() {
  const item = toastQueue.shift(); if (!item) { toasting = false; el('toast-region').replaceChildren(); el('dialog-toast').replaceChildren(); return; }
  toasting = true;
  const html = `<div class="toast">${icon(item.icon)}<div><strong>${escape(item.title)}</strong>${item.detail ? `<small>${escape(item.detail)}</small>` : ''}</div></div>`;
  el('toast-region').innerHTML = html; el('dialog-toast').innerHTML = html; syncToastLayers();
  clearTimeout(toastTimer); toastTimer = setTimeout(nextToast, 4300);
}
function syncToastLayers() { el('toast-region').hidden = dialog.open; el('dialog-toast').hidden = !dialog.open; }
/** @param {string} html */
function openDialog(html) {
  if (!dialog.open) dialogTrigger = document.activeElement;
  el('dialog-content').innerHTML = html;
  if (!dialog.open) dialog.showModal();
  syncToastLayers();
  dialog.scrollTop = 0;
  const focus = dialog.querySelector('[autofocus]');
  if (focus instanceof HTMLElement) focus.focus();
  paintCanvases();
}
function closeDialog() { dialog.close(); }
dialog.addEventListener('close', () => {
  syncToastLayers();
  if (dialogTrigger instanceof HTMLElement && dialogTrigger.isConnected) dialogTrigger.focus({ preventScroll: true });
  else { const fallback = document.querySelector('.view-nav [aria-current="page"]'); if (fallback instanceof HTMLElement) fallback.focus({ preventScroll: true }); }
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog(); } });
el('dialog-close').innerHTML = icon('close');
el('dialog-close').addEventListener('click', closeDialog);

function updateHeader() {
  el('gallery-count').textContent = String(state.gallery.length);
  el('badge-count').textContent = String(Object.keys(state.achievements).length);
  el('profile-button').textContent = state.nickname.slice(0, 1).toUpperCase();
  el('profile-button').setAttribute('aria-label', `Profile and saved progress for ${state.nickname}`);
  el('sound-toggle').innerHTML = icon(state.sound ? 'sound' : 'mute');
  el('sound-toggle').setAttribute('aria-label', state.sound ? 'Disable sound effects' : 'Enable sound effects');
  el('sound-toggle').setAttribute('aria-pressed', String(state.sound));
  for (const button of document.querySelectorAll('[data-view]')) {
    if (!(button instanceof HTMLElement)) continue;
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  el('storage-warning').hidden = !storageIssue;
  el('storage-warning').textContent = storageIssue;
}

function networkNotice() {
  if (connection === 'offline' || connection === 'cached') return `<div class="notice offline-notice" role="status"><div class="notice-copy"><strong>Offline${cache.status ? ' · keeping the last good data' : ' · the wheel is out of reach'}</strong><small>${cache.updatedAt ? `Last checked ${timeElement(cache.updatedAt, true)}. ` : ''}Pending calls stay pending. Reconnect to play a new round.</small></div><button class="small-button" type="button" data-action="refresh">${icon('refresh')} Try again</button></div>`;
  if (connection === 'online' && isStale()) return `<div class="notice offline-notice"><div class="notice-copy"><strong>Data delayed</strong><small>The API is reachable, but its latest status is old. New calls pause until fresh data returns.</small></div><button type="button" class="small-button" data-action="refresh">Check again</button></div>`;
  if (historyError) return `<div class="notice offline-notice"><div class="notice-copy"><strong>History is catching up</strong><small>The live wheel is available. Keeping the last settlement history and all pending calls.</small></div><button type="button" class="small-button" data-action="refresh">Retry history</button></div>`;
  return '';
}
function duelBanner() {
  if (!incoming) return '';
  const c = incoming, existing = state.calls.find(p => p.round === c.round), done = settlementFor(c.round);
  const registered = state.duels.some(d => d.round === c.round && d.opponent === c.nickname && d.theirCall === c.call && d.theirBracket === c.bracket);
  const text = registered ? 'Duel saved. Send your reply link back so both of you can compare.' : done ? 'This round has settled. Only calls made before the deadline can compete.' : c.round === cache.status?.round ? 'Make your own call below. Accepting locks it in.' : 'This is not the open round. No new predictions can be made for it yet.';
  return `<div class="notice duel-notice"><div class="notice-copy"><strong>${escape(c.nickname)} called ${callText(c.call, c.bracket)} for #${c.round}</strong><small>${text}</small></div>${registered ? '<button type="button" class="small-button" data-view="duels">View duel</button>' : existing?.lockedAt ? `<button type="button" class="small-button" data-action="accept-existing">Use my locked call</button>` : ''}<button type="button" class="icon-button" data-action="dismiss-duel" aria-label="Dismiss challenge">${icon('close')}</button></div>`;
}
function awayNotice() {
  if (!awayCalls.length) return '';
  const points = awayCalls.reduce((n, c) => n + (c.result?.points ?? 0), 0);
  return `<div class="notice"><div class="notice-copy"><strong>While you were away…</strong><small>${awayCalls.length} ${awayCalls.length === 1 ? 'call resolved' : 'calls resolved'} · +${points} points · ${awayCalls.filter(c => c.result?.correct).length} correct. Your artworks are safe and sound.</small></div><button type="button" class="small-button" data-action="away">See results</button></div>`;
}

function render() {
  const active = document.activeElement;
  let focusSelector = '';
  if (active instanceof HTMLElement && content.contains(active)) {
    if (active.id) focusSelector = `#${CSS.escape(active.id)}`;
    else for (const key of ['action','filter','historyFilter','result','art','download','share']) {
      if (active.dataset[key]) { const attribute=key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()); focusSelector=`[data-${attribute}="${CSS.escape(active.dataset[key])}"]`; break; }
    }
  }
  const modelDetails = content.querySelector('.model-details');
  const keepDetailsOpen = modelDetails instanceof HTMLDetailsElement && modelDetails.open;
  updateHeader();
  content.innerHTML = networkNotice() + duelBanner() + awayNotice() + (view === 'gallery' ? renderGallery() : view === 'achievements' ? renderAchievements() : view === 'duels' ? renderDuels() : renderPlay());
  const details = content.querySelector('.model-details');
  if (details instanceof HTMLDetailsElement) details.open = keepDetailsOpen;
  paintCanvases(); tickCountdown();
  if (focusSelector) {
    const target = content.querySelector(focusSelector);
    if (target instanceof HTMLElement && !target.matches(':disabled')) target.focus({ preventScroll: true });
    else { const heading = content.querySelector('h2'); if (heading instanceof HTMLElement) { heading.tabIndex=-1; heading.focus({preventScroll:true}); } }
  }
}
function renderPlay() {
  return `<div class="game-grid"><div class="game-main">${renderRound()}${renderActivity()}</div><aside class="sidebar" aria-label="Professor and weekly scoreboard">${renderProfessor()}${renderScoreboard()}</aside></div><div class="below-grid"><section aria-labelledby="recent-title"><div class="section-row"><h2 id="recent-title">Fresh off the wheel</h2><span class="small muted">Real settled rounds</span></div>${renderRecent()}</section><section aria-labelledby="showcase-title"><div class="section-row"><h2 id="showcase-title">A little work of hamster.</h2>${icon('spark')}</div><p class="section-subtitle">Every round paints something different.</p>${renderShowcase()}</section></div>${renderHistory()}`;
}
function renderRound() {
  const w = currentWindow(), c = currentCall(), s = cache.status;
  if (w && draft.round !== w.round) { draft = { round: w.round, side: c?.call ?? null, bracket: c?.bracket ?? null }; formError = ''; }
  const closedByData = Boolean(w && knownClosed(w.round));
  const locked = Boolean(c?.lockedAt || c?.result || closedByData || (w && Date.now() >= w.lockAt));
  if (locked && c) draft = { round: c.round, side: c.call, bracket: c.bracket };
  const dirty = Boolean(c && !locked && hasDraftChanges(c));
  const saved = c && !locked;
  const stateLabel = connection === 'loading' ? 'Checking' : connection === 'offline' || connection === 'cached' ? 'Offline' : isStale() ? 'Delayed' : 'Live';
  const freshness = s?.freshness === 'online' && s.activity !== 'UNKNOWN' && isConnected();
  let distance = '—', distanceHint = 'Distance this round';
  if (s?.openWork !== null && s?.openWork !== undefined && s.mmPerPass !== null) { distance = `≈ ${number(s.openWork * s.mmPerPass / 1000, 2)} m`; distanceHint = closedByData ? 'current wheel round' : 'this round'; }
  else if (s?.distance !== null && s?.distance !== undefined && cache.distanceBase && cache.distanceBase.round === w?.round) { distance = `${number(Math.max(0, s.distance - cache.distanceBase.distance) / 1000, 2)} m`; distanceHint = 'since first check'; }
  const acceptingDuel = incoming && !incoming.versus && incoming.round === w?.round && !state.duels.some(d => d.round === incoming?.round && d.opponent === incoming?.nickname);
  return `<section class="panel round-panel" aria-labelledby="round-title"><div class="round-header"><div><div class="round-id"><h2 id="round-title">${w ? `Round #${w.round}` : 'The next round'}</h2><span class="state-label"><span class="status-dot ${stateLabel === 'Offline' || stateLabel === 'Delayed' ? 'offline' : ''}"></span>${stateLabel}</span></div><p class="round-timing">${w ? `Settles about ${timeElement(w.expectedAt)}` : 'Waiting for the live round number'}</p></div><div class="countdown-wrap"><span class="small" id="countdown-label">${locked ? 'Calls are closed' : 'Calls close in'}</span><strong class="countdown numeric" id="round-countdown" aria-label="Time until calls close">${w ? '00:00' : '—:—'}</strong></div></div>
    <div class="wheel-stage ${!freshness ? 'is-stale' : ''}">${wheelScene(s?.spinning ?? false, s?.rpm ?? null)}<span class="wheel-status"><span class="status-dot ${!freshness ? 'offline' : ''}"></span>${!s ? 'Finding our hamster…' : s.activity === 'UNKNOWN' ? 'Wheel status unavailable' : !freshness ? `Last seen ${s.spinning ? 'spinning' : 'napping'}` : s.spinning ? 'A little wheel time' : 'A well-earned nap'}</span><span class="wheel-rpm numeric">${s ? `${number(s.rpm, 1)} rpm` : '— rpm'}</span></div>
    <div class="live-strip"><span><strong class="numeric">${distance}</strong> <span class="muted">${distanceHint}</span></span><span class="live-note">Refreshes every 10s</span></div>
    <form class="prediction-form" id="prediction-form" novalidate>
      ${c ? `<div class="saved-call-line ${dirty ? 'has-unsaved' : ''}">${icon(locked ? 'lock' : dirty ? 'clock' : 'check')} ${locked ? 'Your call is locked in.' : dirty ? `Unsaved changes. Saved call: ${callText(c.call,c.bracket)}.` : 'Call saved. You can still change it.'}</div>` : ''}
      <div class="form-heading"><h3>${locked ? c ? 'Now, we let him do his thing.' : 'A little patience, a little hamster.' : 'What’s your call?'}</h3>${!locked ? '<span class="points-hint">+10 for a right call</span>' : ''}</div>
      ${locked && !c ? `<p class="small muted">${closedByData ? 'This round has already closed. The next round opens after settlement.' : w && Date.now() >= w.expectedAt ? 'Waiting for the real settlement. The next round opens when it arrives.' : 'Calls close two minutes before the estimated settlement. Catch the next round.'}</p>` : `<fieldset class="call-choices" aria-label="Will the hamster nap or sprint?" ${locked ? 'disabled' : ''}>
        <label class="choice nap-choice"><input type="radio" name="side" value="NAP" id="call-nap" ${draft.side === 'NAP' ? 'checked' : ''} aria-describedby="nap-description"/><span class="choice-symbol">${icon('moon')}</span><span><span class="choice-title">Nap</span><span class="choice-copy" id="nap-description">No wheel work</span></span>${icon('check', 'choice-check')}</label>
        <label class="choice sprint-choice"><input type="radio" name="side" value="SPRINT" id="call-sprint" ${draft.side === 'SPRINT' ? 'checked' : ''} aria-describedby="sprint-description"/><span class="choice-symbol">${icon('bolt')}</span><span><span class="choice-title">Sprint</span><span class="choice-copy" id="sprint-description">Any wheel work</span></span>${icon('check', 'choice-check')}</label>
      </fieldset>
      ${draft.side === 'SPRINT' ? `<fieldset class="bracket-field" ${locked ? 'disabled' : ''}><legend>How many blocks? <span class="muted">+15 for the right bracket</span></legend><div class="bracket-choices">${BRACKETS.map((b, i) => `<label class="bracket-choice"><input id="bracket-${i}" type="radio" name="bracket" value="${b}" ${draft.bracket === b ? 'checked' : ''}/><span>${b.replace('-', '–')}</span></label>`).join('')}</div></fieldset>` : ''}
      ${formError ? `<p class="form-error" id="prediction-error" role="alert">${escape(formError)}</p>` : ''}
      <button type="submit" class="primary-button full prediction-submit" id="call-submit" ${locked || !canPredict() ? 'disabled' : ''}>${icon(locked ? 'lock' : 'check')} ${locked ? 'Call locked in' : acceptingDuel ? 'Lock call & accept duel' : saved ? 'Update my call' : 'Make my call'}${!locked ? icon('arrow') : ''}</button>
      <p class="prediction-note">${locked ? 'The outcome comes from his real wheel. Naps count, too.' : !canPredict() ? 'Fresh live data is needed to make a call.' : 'Just points. Saved here. Auto-locks 2 minutes before settlement.'}</p>`}
      ${c ? `<div class="challenge-row"><button type="button" class="text-button" data-action="challenge">${icon('swords')} Challenge a friend</button>${!locked ? '<button type="button" class="text-button" data-action="lock-now">Lock now</button>' : '<span class="muted">Good luck, wheel reader.</span>'}</div>` : ''}
    </form>${renderCoach()}</section>`;
}
function renderCoach() {
  if (state.onboarding >= 3) return '';
  const steps = [ ['1. Pick a side', 'Nap means no work. Sprint means any wheel work.'], ['2. Outwit the Professor', 'Whiskers studies the history. Your instincts get a vote.'], ['3. Keep a little art', 'Right calls earn points and a one-of-a-kind round artwork.'] ];
  const step = steps[state.onboarding];
  return `<div class="coach"><div><strong>${step[0]}</strong><p>${step[1]}</p></div><span class="coach-count">${state.onboarding + 1}/3</span><button type="button" class="icon-button" data-action="onboarding" aria-label="${state.onboarding === 2 ? 'Finish quick start' : 'Next quick start step'}">${icon(state.onboarding === 2 ? 'check' : 'arrow')}</button></div>`;
}
function renderProfessor() {
  const r = currentRival();
  return `<section class="panel professor-panel" aria-labelledby="professor-title"><div class="professor-heading"><div class="professor-avatar">${hamster('professor')}</div><div><h2 id="professor-title">Professor Whiskers</h2><p>Your local, mildly smug AI rival.</p></div></div>${r ? `<div class="rival-call"><strong class="rival-pick">${icon(r.call === 'NAP' ? 'moon' : 'bolt')}${callText(r.call)}</strong><span class="rival-confidence numeric">${r.confidence}% confident</span></div>${r.call === 'SPRINT' ? `<p class="professor-bracket">Predicting ${r.bracket} blocks</p>` : ''}<div class="confidence-track" aria-hidden="true"><span style="width:${r.confidence}%"></span></div><blockquote class="professor-quote">“${escape(r.reason)}”</blockquote>` : '<p class="small">My forecast for the next open round is brewing. Spectacles on standby.</p>'}<details class="model-details"><summary id="model-summary">What’s behind his whiskers?</summary><p>A browser-computed forecast: 70% activity for this UTC hour over 7 days, 30% momentum from the last 3 known rounds. ${r?.coarse ? 'The API groups history in six-hour buckets, so the hourly pattern is approximate. ' : ''}${r ? `${r.samples} weighted observations. ` : ''}No external AI. No secret hamster intel. Forecasts freeze when first observed.</p></details></section>`;
}
function renderScoreboard() {
  const start = weekStart(Date.now()), score = weekScore(state, start);
  const lead = score.player === score.professor ? 'A perfectly level playing field.' : score.player > score.professor ? `You lead by ${score.player - score.professor} points.` : `The Professor leads by ${score.professor - score.player} points.`;
  const taunt = score.player > score.professor ? '“A statistical anomaly. A charming one, admittedly.”' : score.player < score.professor ? '“The bow tie is doing most of the heavy lifting.”' : score.rounds ? '“A tie? How very symmetrical of us.”' : '“A clean slate. My favorite kind of competition.”';
  return `<section class="panel score-panel" aria-labelledby="score-title"><div class="section-row"><h2 id="score-title">This week’s little rivalry</h2>${icon('trophy')}</div><p class="score-week">${new Date(start).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}–${new Date(start + 6 * DAY).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })} · UTC</p><div class="score-row"><span class="score-person">${icon('user')} ${escape(state.nickname)} <span class="muted">(you)</span></span><strong class="score-value numeric">${score.player}<small> pts</small></strong></div><div class="score-row"><span class="score-person">${icon('glasses')} Professor Whiskers</span><strong class="score-value numeric">${score.professor}<small> pts</small></strong></div><p class="score-lead">${lead}</p><p class="score-taunt">${taunt}</p><p class="score-explainer">Your browser keeps this ${score.rounds}-round rivalry; only rounds you play count.</p></section>`;
}
function renderActivity() {
  const hours = hourlyPattern(cache.buckets), current = new Date().getUTCHours(), hasData = hours.some(h => h.probability !== null);
  return `<section class="panel activity-panel" aria-labelledby="activity-title"><div class="section-row"><h2 id="activity-title">His usual rhythm</h2><span class="small muted">7 days · UTC hours</span></div><div class="hour-strip" role="img" aria-label="${hasData ? 'Usual sprint activity by UTC hour. ' + hours.map((h, i) => `${i}:00 ${h.probability === null ? 'no data' : Math.round(h.probability * 100) + '% active'}`).join(', ') : 'Activity history is not available yet.'}">${hours.map((h, i) => `<span class="hour-bar ${h.probability !== null ? 'known' : ''} ${i === current ? 'current' : ''}" style="height:${h.probability === null ? 15 : 15 + 33 * h.probability}px" title="${String(i).padStart(2, '0')}:00 UTC · ${h.probability === null ? 'No data' : Math.round(h.probability * 100) + '% active' + (h.coarse ? ' (grouped estimate)' : '')}"></span>`).join('')}</div><div class="hour-axis" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div><div class="activity-foot"><span><i class="legend-square"></i> Taller = more likely to sprint</span><span>${hasData ? hours.some(h => h.coarse) ? 'Grouped history · a hint, not a promise' : 'A hint, not a promise' : 'Waiting for history'}</span></div></section>`;
}
function renderRecent() {
  const recent = [...cache.settlements].reverse().slice(0, 5);
  if (!recent.length) return '<p class="small muted">The next settlement will appear here. Real results take a little patience.</p>';
  return `<ul class="recent-list">${recent.map(s => `<li class="recent-item">${hasArtworkSeed(s) ? `<canvas width="320" height="210" data-art-round="${s.through}" class="recent-art" role="img" aria-label="Artwork from round ${s.through}"></canvas>` : `<span class="recent-art">${icon(s.work > 0 ? 'bolt' : 'moon')}</span>`}<div class="recent-meta"><strong>${s.through - s.from > 1 ? `Rounds #${s.from + 1}–${s.through}` : `Round #${s.through}`}</strong><p>${number(s.work)} passes · ${number(s.blocks)} blocks</p></div><span class="recent-result">${icon(s.work > 0 ? 'bolt' : 'moon')}${s.work > 0 ? 'Sprint' : 'Nap'}</span>${explorer(s) ? `<a class="recent-link" href="${explorer(s)}" target="_blank" rel="noopener noreferrer" aria-label="View round ${s.through} ${s.source === 'checkpoint' ? 'checkpoint' : 'settlement'} on Sepolia Etherscan">${icon('external')}</a>` : ''}</li>`).join('')}</ul>`;
}
function renderShowcase() {
  const pieces = [...cache.settlements].reverse().filter(hasArtworkSeed);
  const calm = pieces.find(s => !s.work), energetic = pieces.find(s => s.work > 0);
  const selected = [...new Set([calm, energetic].filter(/** @returns {s is Settlement} */ s => Boolean(s)))];
  if (!selected.length) return '<div class="empty-state"><div class="empty-mascot">'+ hamster('sleep') +'</div><p>Real round artworks will appear when settlement history arrives.</p></div>';
  return `<div class="showcase-grid">${selected.map(s => `<figure class="showcase-piece"><canvas width="640" height="420" data-art-round="${s.through}" role="img" aria-label="${s.work ? 'Energetic swirls' : 'A calm night sky'} generated from round ${s.through}"></canvas><figcaption><span>Round #${s.through}</span><span class="muted">${s.work ? 'Wheel symphony' : 'Quiet constellation'}</span></figcaption></figure>`).join('')}</div><p class="showcase-caption">From real settlements. Call a round correctly to add its artwork to your collection.</p>`;
}
function renderHistory() {
  if (!state.calls.length) return '';
  const calls = [...state.calls].reverse().filter(c => historyFilter === 'all' || historyFilter === 'pending' && !c.result || historyFilter === 'correct' && c.result?.correct).slice(0, 30);
  return `<section class="call-history-section" id="call-history" aria-labelledby="history-title"><div class="section-row"><h2 id="history-title">Your call log</h2><span class="small muted">${state.calls.length} ${state.calls.length === 1 ? 'call' : 'calls'} saved</span></div><div class="filter-row" aria-label="Filter call history">${[['all','All calls'],['pending','Pending'],['correct','Correct']].map(([f, label]) => `<button type="button" class="filter-button" data-history-filter="${f}" aria-pressed="${historyFilter === f}">${label}</button>`).join('')}</div>${calls.length ? `<ul class="call-history">${calls.map(c => `<li class="history-item"><div><span class="history-call">#${c.round} · ${callText(c.call, c.bracket)}</span><p>${timeElement(c.createdAt, true)}${c.result ? ` · ${number(c.result.settlement.work)} passes · ${number(c.result.settlement.blocks)} blocks` : ' · Awaiting an exact settlement'}</p></div>${c.result ? `<button class="text-button" type="button" data-result="${c.round}"><span class="result-points">+${c.result.points}</span> ${c.result.correct ? 'Right call' : 'A little surprise'} ${icon('arrow')}</button>` : '<span class="pending-label">Pending · unscored</span>'}</li>`).join('')}</ul>` : '<p class="small muted">No calls match this filter.</p>'}<p class="field-help">Missed rounds are unscored. Unavailable old results stay pending until exact data returns.${state.calls.length > 30 ? ' Showing the most recent 30 matches; the JSON export includes every call.' : ''}</p></section>`;
}
function renderGallery() {
  const earned = state.calls.filter(c => state.gallery.includes(c.round)).reverse();
  const selected = earned.filter(c => filter === 'all' || (filter === 'nap' ? c.result?.settlement.work === 0 : (c.result?.settlement.work ?? 0) > 0));
  return `<section aria-labelledby="gallery-title"><div class="view-title"><div><h2 id="gallery-title">Your little art collection</h2><p>Real wheel work. One-of-a-kind keepsakes.</p></div><span class="small muted numeric">${earned.length} ${earned.length === 1 ? 'piece' : 'pieces'}</span></div>${earned.length ? `<div class="filter-row" aria-label="Filter artworks">${[['all','All pieces'],['nap','Quiet naps'],['sprint','Big sprints']].map(([f,l]) => `<button class="filter-button" type="button" data-filter="${f}" aria-pressed="${filter === f}">${l}</button>`).join('')}</div>${selected.length ? `<div class="gallery-grid">${selected.slice(0,galleryLimit).map(c => `<article class="art-piece"><button type="button" class="art-open" data-art="${c.round}" aria-label="Open round ${c.round} artwork"><canvas width="640" height="420" data-art-round="${c.round}" role="img" aria-label="${c.result?.settlement.work ? 'Energetic swirls' : 'A calm night sky'} from round ${c.round}"></canvas></button><div class="art-piece-content"><h3>Round #${c.round}</h3><p>${callText(c.call, c.bracket)} · ${number(c.result?.settlement.blocks)} blocks · +${c.result?.points} pts</p><div class="art-actions"><button type="button" class="text-button" data-download="${c.round}">${icon('download')} Download PNG</button><button type="button" class="icon-button" data-share="${c.round}" aria-label="Share round ${c.round} artwork on X">${icon('share')}</button></div></div></article>`).join('')}</div>${selected.length > galleryLimit ? `<div class="dialog-actions"><button type="button" id="gallery-load-more" class="secondary-button" data-action="more-art">Show ${Math.min(12,selected.length-galleryLimit)} more artworks ${icon('arrow')}</button></div>` : ''}` : '<p class="small muted">No pieces in this mood yet. Your next right call could change that.</p>'}` : `<div class="empty-state"><div class="empty-mascot">${hamster('awake')}</div><h3>Good calls become good art.</h3><p>Call a round correctly and its artwork is yours. Every piece is seeded by a real settlement, from sleepy skies to wild little swirls.</p><button type="button" class="primary-button" data-view="play">Make your first call ${icon('arrow')}</button></div><div class="section-row"><h3>A glimpse from the wheel</h3></div>${renderShowcase()}`}</section>`;
}
function renderAchievements() {
  return `<section aria-labelledby="badges-title"><div class="view-title"><div><h2 id="badges-title">Small paws. Big milestones.</h2><p>Nine little reasons to trust your hamster instincts.</p></div><span class="small muted numeric">${Object.keys(state.achievements).length}/9 unlocked</span></div><div class="badges-grid">${ACHIEVEMENTS.map(a => `<article class="badge-card ${state.achievements[a.id] ? 'is-unlocked' : ''}"><div class="badge-illustration ${a.color}">${icon(a.icon)}</div><h3>${a.name}</h3><p>${a.description}</p><span class="badge-status">${icon(state.achievements[a.id] ? 'check' : 'lock')}${state.achievements[a.id] ? `Earned ${new Date(state.achievements[a.id]).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })}` : 'Waiting in the wings'}</span></article>`).join('')}</div></section>`;
}
function renderDuels() {
  const settlements = allSettlements();
  /** @type {Map<string, {win:number,loss:number,draw:number}>} */ const records = new Map();
  for (const d of state.duels) { const result = duelResult(d, settlements); if (!result) continue; const record = records.get(d.opponent) ?? { win: 0, loss: 0, draw: 0 }; record[/** @type {'win'|'loss'|'draw'} */ (result.outcome)]++; records.set(d.opponent, record); }
  return `<section aria-labelledby="duels-title"><div class="view-title"><div><h2 id="duels-title">A friendly battle of instincts.</h2><p>One hamster. Two calls. Bragging rights only.</p></div>${icon('swords')}</div><div class="duel-intro"><div class="panel duel-start"><h3>Think like a hamster. Tell a friend.</h3><p>Save a call for the open round, then lock it and send a challenge link. Your friend sends a reply link back.</p><button class="primary-button" type="button" data-action="challenge">Challenge a friend ${icon('arrow')}</button></div><div class="duel-instructions"><h3>Good old-fashioned link duels.</h3><ol><li>Send your locked call before the round closes.</li><li>Your friend locks a call and sends you a reply link.</li><li>Open the reply. Both browsers compare the real result.</li></ol><p class="field-help">Links carry calls, not live messages. There is no shared server. Duels compare call and bracket points; streak bonuses stay personal.</p></div></div>${records.size ? `<h3 style="margin-bottom:16px">Your friendly rivalries</h3><div class="record-list">${[...records].map(([name,r]) => `<div class="record-chip">${escape(name)}<span>${r.win} won · ${r.loss} lost · ${r.draw} drawn</span></div>`).join('')}</div>` : ''}<div class="section-row"><h3>Duel history</h3><span class="small muted">${state.duels.length} ${state.duels.length === 1 ? 'duel' : 'duels'}</span></div>${state.duels.length ? `<ul class="duel-list">${[...state.duels].reverse().map(d => { const result = duelResult(d, settlements); return `<li class="duel-item"><div><h3>You vs. ${escape(d.opponent)} · #${d.round}</h3><p>You: ${callText(d.myCall,d.myBracket)} · ${escape(d.opponent)}: ${callText(d.theirCall,d.theirBracket)}</p></div><div><span class="duel-outcome">${result ? `${result.outcome === 'win' ? 'You won' : result.outcome === 'loss' ? 'They won' : 'A perfect tie'} · ${result.yours}–${result.theirs}` : 'Awaiting the wheel'}</span><button type="button" class="text-button" data-reply="${escape(d.id)}">${icon('copy')} Copy reply link</button></div></li>`; }).join('')}</ul>` : '<p class="small muted">Your first friendly rivalry starts with a locked call.</p>'}${state.sent.length ? `<div class="section-row" style="margin-top:28px"><h3>Challenges you’ve sent</h3></div><ul class="duel-list">${[...state.sent].reverse().slice(0,20).map(c => `<li class="duel-item"><div><h3>Round #${c.round} · ${callText(c.call,c.bracket)}</h3><p>${state.duels.some(d => d.round === c.round) ? 'Reply received in this browser' : 'Open a friend’s reply link to add them to your history.'}</p></div><button type="button" class="text-button" data-copy-challenge="${c.round}">${icon('copy')} Copy challenge</button></li>`).join('')}</ul>` : ''}</section>`;
}

function paintCanvases() {
  for (const canvas of document.querySelectorAll('canvas[data-art-round]')) {
    if (!(canvas instanceof HTMLCanvasElement)) continue;
    const round = Number(canvas.dataset.artRound), s = settlementFor(round); if (s && hasArtworkSeed(s)) paintArt(canvas, s, round);
  }
}

function tickCountdown() {
  if (view !== 'play') return;
  const w = currentWindow(), countdown = document.getElementById('round-countdown'), label = document.getElementById('countdown-label');
  if (!w || !countdown || !label) return;
  const now = Date.now(), c = currentCall(), seconds = Math.max(0, Math.ceil((w.lockAt - now) / 1000));
  const closed = c?.lockedAt || c?.result || knownClosed(w.round) || now >= w.lockAt;
  countdown.textContent = closed ? 'Locked' : `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
  countdown.setAttribute('aria-label', closed ? 'Calls are locked for this round' : `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds until calls close`);
  label.textContent = closed ? now >= w.expectedAt ? 'Awaiting settlement' : 'Calls are closed' : 'Calls close in';
}

/** @param {string} next */
function changeView(next) {
  if (!['play','gallery','achievements','duels'].includes(next)) return;
  view = next; render();
  if (dialog.open) closeDialog();
  const nav = document.querySelector(`.view-nav [data-view="${next}"]`);
  if (nav instanceof HTMLElement) nav.focus({ preventScroll: true });
  el('main').scrollIntoView({ block: 'start' });
}
function announceAchievements() {
  const { unlocked } = reconcile(state, cache.settlements);
  for (const a of unlocked) { toast(`Badge unlocked: ${a.name}`, a.description, a.icon); playSound('badge', state.sound); }
}
function submitCall() {
  const w = currentWindow(), now = Date.now(), existing = currentCall();
  if (!w || !canPredict() || existing?.lockedAt || existing?.result) { toast('Calls are closed for this round.', 'A fresh open round will appear after settlement.', 'lock'); render(); return; }
  if (!draft.side || draft.side === 'SPRINT' && !draft.bracket) {
    formError = !draft.side ? 'Choose Nap or Sprint to make your call.' : 'Choose a block bracket for your sprint call.';
    render();
    const focus = !draft.side ? el('call-nap') : el('bracket-0'); focus.setAttribute('aria-invalid', 'true'); focus.setAttribute('aria-describedby', 'prediction-error'); focus.focus();
    return;
  }
  const rival = currentRival();
  if (!rival) { toast('The Professor is still finding his spectacles.', 'Try again when the live forecast is ready.', 'clock'); return; }
  const accepting = incoming && !incoming.versus && incoming.round === w.round;
  /** @type {Call} */ const c = { round: w.round, call: draft.side, bracket: draft.side === 'SPRINT' ? draft.bracket : null, createdAt: existing?.createdAt ?? now, updatedAt: now, expectedAt: w.expectedAt, lockAt: w.lockAt, lockedAt: accepting ? now : null, rival };
  if (existing) state.calls[state.calls.indexOf(existing)] = c; else state.calls.push(c);
  if (accepting && incoming) storeDuel(incoming, c);
  formError = ''; playSound('call', state.sound);
  toast(accepting ? 'Duel accepted. Call locked.' : existing ? 'Call updated.' : 'Your call is in.', accepting ? 'Copy your reply link and send it back.' : `Calling ${callText(c.call,c.bracket)} for round #${c.round}.`, accepting ? 'swords' : 'check');
  announceAchievements(); persist(); render();
  if (accepting && incoming) openReplyFor(incoming, c);
}
function showHelp() {
  openDialog(`<h2 id="dialog-title">A small guide to big instincts.</h2><p class="dialog-intro">Nap or Sprint? is a points-only prediction game powered by a real hamster’s wheel on Squeekchain, currently on Sepolia.</p><div class="dialog-section"><h3>1. Call the next round</h3><p>Nap = zero wheel passes. Sprint = any work above zero. For a sprint, also pick a block bracket: 1–10, 11–30, 31–60 or 61+.</p><p class="field-help">A sprint can complete zero blocks. Its sprint call still counts, but none of the brackets match.</p></div><div class="dialog-section"><h3>2. Let the wheel decide</h3><p>A round usually settles about every 15 minutes. The countdown uses the median spacing of recent settlements; the chain can be late. Saved calls auto-lock 2 minutes before that estimate. You can also lock early. A saved call’s deadline never moves.</p><p class="field-help">When one settlement covers several rounds, its aggregate work and blocks decide each covered call. Exact results only; missing history stays pending. All displayed times are UTC, with your local time on hover.</p></div><div class="dialog-section"><h3>3. Collect the good calls</h3><ul><li>Right Nap or Sprint: <strong>+10 points</strong>.</li><li>Right sprint bracket: <strong>+15 points</strong>.</li><li>Streak: <strong>+5 × consecutive correct calls</strong>, starting at +5 for your first right call.</li></ul><p>Missed rounds are unscored. A wrong call resets your streak. Correct calls collect deterministic artwork seeded by the settlement transaction hash.</p></div><div class="dialog-section"><h3>The Professor & your friends</h3><p>Whiskers forecasts locally from 7-day activity and recent momentum. The weekly rivalry scores the same rounds you play and resets Monday at 00:00 UTC. Beat him over a completed week to earn his badge.</p><p style="margin-top:12px">Friend duels use links: send a locked challenge, get a locked reply link back, open it. Both browsers can compare the result. Duels count prediction and bracket points; personal streaks stay personal. Links are friendly honor-system challenges.</p></div><div class="dialog-section"><h3>Just you, the wheel & this browser.</h3><p>No account, wallets, money, tracking or cookies. Progress lives in localStorage on this browser and origin. Export a backup in your profile before switching devices or gateways. If the API is offline, the last good data stays visible and pending calls wait.</p><p style="margin-top:12px">The hamster sets his own pace. Rest is normal and healthy. We predict what he chooses; we never ask him to run.</p></div><div class="dialog-actions"><button class="primary-button" type="button" data-action="close">Back to the wheel ${icon('arrow')}</button></div>`);
}
function showProfile() {
  openDialog(`<h2 id="dialog-title">Your corner of the arcade.</h2><p class="dialog-intro">A name for the scoreboard. A safe place for your progress.</p><form id="profile-form" class="profile-form"><label class="field-label" for="nickname">Nickname</label><input class="text-input" id="nickname" name="nickname" value="${escape(state.nickname)}" maxlength="24" autocomplete="nickname" required aria-describedby="nickname-help"/><p class="field-help" id="nickname-help">Up to 24 characters. Included in the friend links you choose to share.</p><button class="primary-button" type="submit">Save nickname ${icon('check')}</button><p class="form-error" id="profile-error" role="alert" hidden></p></form><hr class="settings-divider"/><h3>Keep your little world.</h3><p class="field-help">${state.calls.length} calls · ${state.gallery.length} artworks · ${Object.keys(state.achievements).length} badges. Everything is saved in this browser. Export a JSON backup to move it with you.</p><div class="data-actions" style="margin-top:16px"><button class="secondary-button" type="button" data-action="export">${icon('download')} Export progress</button><label class="secondary-button import-label">${icon('refresh')} Import progress<input type="file" id="import-file" accept="application/json,.json" aria-label="Choose a progress JSON file"/></label></div><p class="field-help" id="import-feedback" role="status"></p><div id="import-preview"></div><hr class="settings-divider"/><button class="text-button" type="button" data-action="restart-guide">Replay the 3-step quick start ${icon('arrow')}</button>`);
}
function exportProgress() {
  const json = JSON.stringify({ app: 'nap-or-sprint', exportedAt: new Date().toISOString(), state }, null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), `nap-or-sprint-progress-${new Date().toISOString().slice(0,10)}.json`);
  toast('Your little world, backed up.', 'Keep this JSON file to restore progress in another browser.', 'download');
}
/** @param {File} file */
async function previewImport(file) {
  const feedback = el('import-feedback');
  importCandidate = null; el('import-preview').replaceChildren();
  if (file.size > 8_388_608) { feedback.textContent = 'Choose a progress file smaller than 8 MiB.'; return; }
  try {
    const raw = JSON.parse(await file.text());
    if (raw.app !== 'nap-or-sprint') throw new Error('Choose an exported Nap or Sprint? progress file.');
    importCandidate = validateState(raw.state);
    feedback.textContent = '';
    el('import-preview').innerHTML = `<div class="import-confirm"><h3>Replace this browser’s progress?</h3><p class="field-help">Importing replaces the current save. Export it first if you want to keep both.</p><div class="import-stats"><span><strong>${escape(importCandidate.nickname)}</strong><br/>${importCandidate.calls.length} calls</span><span>${importCandidate.gallery.length} artworks<br/>${Object.keys(importCandidate.achievements).length} badges</span></div><div class="data-actions"><button class="primary-button" type="button" data-action="confirm-import">Import and replace progress</button><button class="secondary-button" type="button" data-action="cancel-import">Cancel</button></div></div>`;
  } catch (error) { feedback.textContent = error instanceof Error ? error.message : 'This file could not be imported. Choose a valid progress JSON file.'; }
}
function confirmImport() {
  if (!importCandidate) return;
  const candidate = importCandidate;
  // Persist before swapping the visible state so a failed write keeps the old save.
  if (!saveState(candidate, true)) { el('import-feedback').textContent = 'Unable to save the import. Free browser storage and try again; your current progress remains.'; return; }
  state = candidate; importCandidate = null; draft.round = 0;
  ensureRival(); announceAchievements(); persist(); closeDialog(); render(); toast('Progress restored.', `Welcome back, ${state.nickname}.`);
}
/** @param {Challenge} challenge */
function challengeURL(challenge) { const url = new URL(location.href); url.hash = `duel=${encodeChallenge(challenge)}`; return url.href; }
/** @param {string} text */
async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* Use the selectable link as a fallback. */ }
  const field = document.getElementById('challenge-link');
  if (field instanceof HTMLTextAreaElement) { field.focus(); field.select(); try { return document.execCommand('copy'); } catch { return false; } }
  return false;
}
/** @param {Challenge} challenge @param {boolean} [reply] */
function showLink(challenge, reply = false) {
  const url = challengeURL(challenge);
  openDialog(`<h2 id="dialog-title">${reply ? 'Send your answer back.' : 'A friendly challenge is ready.'}</h2><p class="dialog-intro">${reply ? 'Send this reply link to your challenger. When they open it, both browsers have both calls and can compare the settlement.' : 'Send this link to a friend before calls close. Ask them to send their reply link back, then open it here.'}</p><div class="locked-summary">${icon(challenge.call === 'NAP' ? 'moon' : 'bolt')}<span><strong>${escape(challenge.nickname)}</strong> · Round #${challenge.round}<br/>${callText(challenge.call, challenge.bracket)} · locked</span></div><div class="dialog-section"><label class="field-label" for="challenge-link">${reply ? 'Reply link' : 'Challenge link'}</label><textarea id="challenge-link" class="text-input link-field" readonly spellcheck="false">${escape(url)}</textarea></div><div class="dialog-actions"><button class="primary-button" type="button" data-action="copy-link">${icon('copy')} Copy ${reply ? 'reply' : 'challenge'} link</button></div><p class="field-help">No server sync. The calls and nickname travel in the link. Keep a backup of your local progress.</p>`);
}
function startChallenge() {
  const c = currentCall();
  if (!c) { changeView('play'); toast('Make a call first.', 'Then you can lock it and challenge a friend.', 'swords'); return; }
  if (!c.lockedAt && hasDraftChanges(c)) { toast('Save your changes first.', 'Update your call before creating a challenge.', 'clock'); document.getElementById('call-submit')?.focus(); return; }
  if (c.result) { toast('That round has already settled.', 'Challenge a friend on the next open round.', 'clock'); return; }
  const sent = state.sent.find(s => s.round === c.round);
  if (sent) { showLink(sent); return; }
  openDialog(`<h2 id="dialog-title">Fancy a friendly duel?</h2><p class="dialog-intro">${c.lockedAt ? 'Your call is locked. Give your friend a prediction to beat.' : 'Creating a challenge locks your call immediately. The wheel gets the final word.'}</p><div class="locked-summary">${icon(c.call === 'NAP' ? 'moon' : 'bolt')}<span>Round #${c.round}<br/><strong>${callText(c.call,c.bracket)}</strong></span></div><form id="challenge-form" data-round="${c.round}" class="profile-form"><label class="field-label" for="challenge-nickname">Your nickname</label><input class="text-input" id="challenge-nickname" name="nickname" value="${escape(state.nickname)}" maxlength="24" autocomplete="nickname" required/><p class="field-help">Your friend must send a reply link back. Open it here so you both have both calls.</p><div class="dialog-actions"><button type="submit" class="primary-button">${icon('lock')} ${c.lockedAt ? 'Create challenge link' : 'Lock & create link'}</button></div></form>`);
}
/** @param {Call} c */
function lockCall(c) {
  if (c.lockedAt || c.result) return;
  c.lockedAt = Math.min(Date.now(), c.lockAt); persist(); render();
  playSound('call', state.sound); toast('Call locked in.', 'Now the hamster has the floor.', 'lock');
}
function confirmLock() {
  const c = currentCall(); if (!c || c.lockedAt) return;
  if (hasDraftChanges(c)) { toast('Save your changes first.', 'Update your call before locking it.', 'clock'); document.getElementById('call-submit')?.focus(); return; }
  openDialog(`<h2 id="dialog-title">Ready to lock your call?</h2><p class="dialog-intro">${callText(c.call,c.bracket)} for round #${c.round}. Once locked, this call cannot be changed.</p><div class="dialog-actions"><button class="secondary-button" type="button" data-action="close">Keep it editable</button><button class="primary-button" type="button" data-action="confirm-lock">${icon('lock')} Lock my call</button></div>`);
}
/** @param {Challenge} their @param {Call} c @param {'sent'|'received'} [direction] */
function storeDuel(their, c, direction = 'received') {
  const plain = { nickname: their.nickname, round: their.round, call: their.call, bracket: their.bracket };
  const id = `${their.round}:${encodeChallenge(plain)}`;
  if (!state.duels.some(d => d.id === id)) state.duels.push({ id, round: their.round, opponent: their.nickname, theirCall: their.call, theirBracket: their.bracket, myCall: c.call, myBracket: c.bracket, createdAt: Date.now(), direction });
}
/** @param {Challenge} their @param {Call} c */
function openReplyFor(their, c) { showLink({ nickname: state.nickname, round: c.round, call: c.call, bracket: c.bracket, versus: { nickname: their.nickname, round: their.round, call: their.call, bracket: their.bracket } }, true); }
function acceptExisting() {
  if (!incoming) return;
  const c = state.calls.find(c => c.round === incoming?.round);
  if (!c?.lockedAt) return;
  storeDuel(incoming, c); announceAchievements(); persist(); render(); openReplyFor(incoming, c);
}
function handleIncoming() {
  if (!incoming?.versus) return;
  const v = incoming.versus, c = state.calls.find(c => c.round === v.round);
  if (c?.lockedAt && c.call === v.call && c.bracket === v.bracket) {
    storeDuel(incoming, c, 'sent'); announceAchievements(); persist(); toast(`Reply received from ${incoming.nickname}.`, 'Both calls are saved. The real wheel decides.', 'swords');
  } else toast('This reply does not match a locked call here.', 'Open it in the browser where you made the original challenge.', 'swords');
}
/** @param {number} round */
function showResult(round) {
  const c = state.calls.find(c => c.round === round); if (!c?.result) return;
  const r = c.result, s = r.settlement;
  openDialog(`<h2 id="dialog-title">${r.correct ? 'You read the hamster right.' : 'A small hamster plot twist.'}</h2><p class="dialog-intro">Round #${c.round} settled. You called ${callText(c.call,c.bracket)}.</p><div class="result-hero ${r.correct ? '' : 'missed'} reveal-enter">${hamster(r.correct ? 'awake' : 'sleep')}<strong class="numeric">+${r.points}</strong><p>${r.correct ? `${r.streak} correct ${r.streak === 1 ? 'call' : 'calls'} in a row. A fine little instinct.` : 'No points this time. His pace, his choice. A new round awaits.'}</p></div><dl class="result-grid"><div><dt>The real wheel</dt><dd>${s.work > 0 ? 'Sprint' : 'Nap'}</dd></div><div><dt>Wheel passes</dt><dd class="numeric">${number(s.work)}</dd></div><div><dt>Blocks completed</dt><dd class="numeric">${number(s.blocks)}</dd></div><div><dt>Block bracket</dt><dd>${blockBracket(s.blocks)?.replace('-', '–') ?? 'None (0 blocks)'}</dd></div></dl><div class="result-breakdown"><p><span>Right call</span><strong>+${r.correct ? 10 : 0}</strong></p><p><span>Exact sprint bracket</span><strong>+${r.bracketCorrect ? 15 : 0}</strong></p><p><span>Streak bonus${r.streak ? ` (5 × ${r.streak})` : ''}</span><strong>+${5 * r.streak}</strong></p><p><span>Professor Whiskers</span><strong>+${r.rivalPoints} pts</strong></p></div>${s.through - s.from > 1 ? `<p class="field-help">This settlement covers rounds #${s.from + 1}–${s.through}. The numbers above are totals for that batch.</p>` : ''}${explorer(s) ? `<a class="result-explorer" href="${explorer(s)}" target="_blank" rel="noopener noreferrer">View the ${s.source === 'checkpoint' ? 'verified checkpoint' : 'real settlement'} ${icon('external')}</a>` : '<p class="field-help">The API has not supplied a transaction link for this result.</p>'}${s.source === 'checkpoint' ? '<p class="field-help">The API archived the original settlement. An exact public checkpoint verifies this result; the artwork waits for the original settlement hash.</p>' : ''}${r.correct && hasArtworkSeed(s) ? `<canvas class="result-art reveal-enter" width="640" height="420" data-art-round="${c.round}" role="img" aria-label="Your earned artwork for round ${c.round}"></canvas><p class="field-help">A little keepsake, added to your collection.</p><div class="dialog-actions"><button class="secondary-button" type="button" data-download="${c.round}">${icon('download')} Download PNG</button><button class="primary-button" type="button" data-share="${c.round}">${icon('share')} Share on X</button></div>` : '<div class="dialog-actions"><button class="primary-button" type="button" data-action="close">Back to the wheel</button></div>'}`);
}
/** @param {number} round */
function showArtwork(round) {
  const c = state.calls.find(c => c.round === round); if (!c?.result?.correct || !state.gallery.includes(round)) return;
  openDialog(`<h2 id="dialog-title">${c.result.settlement.work ? 'A wheel symphony.' : 'A quiet constellation.'}</h2><p class="dialog-intro">Round #${c.round} · ${callText(c.call,c.bracket)} · ${number(c.result.settlement.work)} passes · ${number(c.result.settlement.blocks)} blocks</p><canvas class="result-art" width="960" height="630" data-art-round="${c.round}" role="img" aria-label="Deterministic artwork earned for round ${c.round}"></canvas><p class="field-help">Seeded by the real settlement transaction. Same round, same artwork, always.</p><div class="dialog-actions"><button class="secondary-button" type="button" data-download="${c.round}">${icon('download')} Download PNG</button><button class="primary-button" type="button" data-share="${c.round}">${icon('share')} Share on X</button></div><p class="field-help">Sharing downloads your PNG and opens an X draft. Attach the downloaded card to your post.</p>`);
}
/** @param {number} round @param {boolean} [share] */
async function downloadArt(round, share = false) {
  const c = state.calls.find(c => c.round === round); if (!c?.result?.correct) return;
  if (share) {
    const text = `I called ${callText(c.call,c.bracket)} in Nap or Sprint? and got it right! Round #${round}: ${c.result.settlement.work} wheel passes, ${c.result.settlement.blocks} blocks. +${c.result.points} points. One real hamster, one little artwork. #Squeekchain`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(new URL('.', location.href).href)}`, '_blank', 'noopener,noreferrer');
  }
  try { const blob = await makeArtCard(c); downloadBlob(blob, `nap-or-sprint-round-${round}.png`); toast(share ? 'Card downloaded. Your X draft is open.' : 'A little artwork, ready to keep.', share ? 'Attach the PNG to your post. If a popup was blocked, allow it and try again.' : `Round #${round} · PNG card`, 'download'); }
  catch { toast('Unable to create the PNG.', 'Try another browser with canvas downloads enabled.', 'art'); }
}
function showAway() {
  const calls = awayCalls.length ? awayCalls : state.calls.filter(c => c.result).slice(-10);
  openDialog(`<h2 id="dialog-title">While you were away…</h2><p class="dialog-intro">${calls.length} ${calls.length === 1 ? 'call found its answer' : 'calls found their answers'}. The hamster kept his own schedule.</p><ul class="call-history" style="margin-top:20px">${calls.map(c => `<li class="history-item"><div><span class="history-call">#${c.round} · ${callText(c.call,c.bracket)}</span><p>${c.result?.correct ? state.gallery.includes(c.round) ? 'Right call · artwork collected' : 'Right call · artwork seed not yet available' : 'A little surprise from the wheel'}</p></div><button type="button" class="text-button" data-result="${c.round}">+${c.result?.points} pts ${icon('arrow')}</button></li>`).join('')}</ul><p class="field-help">Any calls without an exact settlement stay pending. Missed rounds are unscored.</p><div class="dialog-actions"><button class="primary-button" type="button" data-action="dismiss-away">Back to the wheel ${icon('arrow')}</button></div>`);
}

/** @param {string} path @returns {Promise<any>} */
async function fetchJSON(path) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try { const response = await fetch(`${API}${path}`, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache' }); if (!response.ok) throw new Error(`API ${response.status}`); return await response.json(); }
  finally { clearTimeout(timeout); }
}
function ensureRival() {
  const w = currentWindow();
  if (!w || Date.now() >= w.lockAt || knownClosed(w.round) || !isConnected() || state.rivals.some(r => r.round === w.round)) return;
  state.rivals.push(makeRival(w.round, cache.settlements, cache.buckets, w.expectedAt));
  state.rivals = state.rivals.slice(-6000); persist();
}
/** @param {boolean} [forceHistory] */
async function refresh(forceHistory = false) {
  if (refreshing) return;
  refreshing = true;
  const history = forceHistory || Date.now() - lastHistoryAttempt >= 30_000;
  if (history) lastHistoryAttempt = Date.now();
  const results = await Promise.allSettled([fetchJSON('/status'), ...(history ? [fetchJSON('/settlements?range=24h'), fetchJSON('/settlements?range=7d')] : [])]);
  const now = Date.now(), statusResult = results[0];
  if (history) {
    let valid = 0;
    for (let i = 1; i < results.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled' || !result.value || !Array.isArray(result.value.recentSettlements)) continue;
      const parsed = normalizeHistory(result.value); valid++;
      cache.settlements = mergeSettlements(cache.settlements, parsed.settlements);
      if (i === 2 && parsed.buckets.length) cache.buckets = parsed.buckets;
    }
    historyError = valid < 2;
    if (valid) cache.historyAt = now;
  }
  if (statusResult.status === 'fulfilled') {
    const parsed = normalizeStatus(statusResult.value);
    if (parsed.round !== null && (!cache.status || parsed.generatedAt >= cache.status.generatedAt)) {
      if (!cache.distanceBase || cache.distanceBase.round !== parsed.round || (parsed.distance !== null && parsed.distance < cache.distanceBase.distance)) cache.distanceBase = parsed.distance === null ? null : { round: parsed.round, distance: parsed.distance, partial: true };
      cache.status = parsed; cache.statusAt = now; cache.updatedAt = now; connection = 'online';
      cache.settlements = mergeSettlements(cache.settlements, anchorSettlement(statusResult.value, cache.settlements));
    } else connection = 'offline';
  } else connection = 'offline';
  for (const c of state.calls) if (!c.lockedAt && knownClosed(c.round)) c.lockedAt = Math.min(now,c.lockAt);
  const { newlyResolved, unlocked } = reconcile(state, cache.settlements, now);
  for (const a of unlocked) { toast(`Badge unlocked: ${a.name}`, a.description, a.icon); playSound('badge', state.sound); }
  ensureRival(); persist(); saveCache(cache); refreshing = false;
  const returning = resumedAfterAway || firstRefresh && now - loadedLastSeen > 5 * MINUTE;
  resumedAfterAway = false;
  if (newlyResolved.length && (returning || newlyResolved.length > 1)) awayCalls = newlyResolved;
  render();
  if (newlyResolved.length === 1 && !returning) {
    const c = newlyResolved[0]; playSound(c.result?.correct ? 'win' : 'miss', state.sound);
    if (!dialog.open) showResult(c.round); else toast(`Round #${c.round} has settled.`, 'Open your call log to reveal the result.', 'spark');
  }
  firstRefresh = false;
}

document.addEventListener('change', event => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.name === 'side') { draft.side = /** @type {import('./types').Side} */ (target.value); formError = ''; render(); }
  if (target.name === 'bracket') { draft.bracket = /** @type {import('./types').Bracket} */ (target.value); formError = ''; render(); }
  if (target.id === 'import-file' && target.files?.[0]) void previewImport(target.files[0]);
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === 'prediction-form') submitCall();
  if (form.id === 'profile-form') {
    const input = /** @type {HTMLInputElement} */ (el('nickname'));
    if (!input.value.trim()) { el('profile-error').hidden = false; el('profile-error').textContent = 'Choose a nickname of 1–24 characters.'; input.setAttribute('aria-invalid','true'); input.setAttribute('aria-describedby','profile-error'); input.focus(); return; }
    state.nickname = cleanNickname(input.value); persist(); closeDialog(); render(); toast('Nickname saved.', `Looking good, ${state.nickname}.`);
  }
  if (form.id === 'challenge-form') {
    const c = state.calls.find(c => c.round === Number(form.dataset.round)); if (!c || c.result) { closeDialog(); toast('That round has settled. Choose the next open round.', '', 'clock'); return; }
    const input = /** @type {HTMLInputElement} */ (el('challenge-nickname'));
    if (!input.value.trim()) { input.setCustomValidity('Choose a nickname for your challenge.'); input.reportValidity(); return; }
    state.nickname = cleanNickname(input.value); c.lockedAt ??= Math.min(Date.now(), c.lockAt);
    const challenge = { nickname: state.nickname, round: c.round, call: c.call, bracket: c.bracket };
    state.sent.push(challenge); persist(); render(); playSound('call',state.sound); showLink(challenge);
  }
});
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  if (button.dataset.view) { changeView(button.dataset.view); return; }
  if (button.dataset.filter) { filter = button.dataset.filter; galleryLimit = 12; render(); return; }
  if (button.dataset.historyFilter) { historyFilter = button.dataset.historyFilter; render(); document.getElementById('call-history')?.scrollIntoView({ block: 'start' }); return; }
  if (button.dataset.result) { showResult(Number(button.dataset.result)); return; }
  if (button.dataset.art) { showArtwork(Number(button.dataset.art)); return; }
  if (button.dataset.download) { void downloadArt(Number(button.dataset.download)); return; }
  if (button.dataset.share) { void downloadArt(Number(button.dataset.share), true); return; }
  if (button.dataset.reply) { const d = state.duels.find(d => d.id === button.dataset.reply), c = state.calls.find(c => c.round === d?.round); if (d && c) openReplyFor({ nickname: d.opponent, round: d.round, call: d.theirCall, bracket: d.theirBracket }, c); return; }
  if (button.dataset.copyChallenge) { const c = state.sent.find(c => c.round === Number(button.dataset.copyChallenge)); if (c) showLink(c); return; }
  switch (button.dataset.action) {
    case 'refresh': void refresh(true); break;
    case 'more-art': { const previous=galleryLimit; galleryLimit+=12; render(); const next=content.querySelectorAll('.art-open')[previous]; if(next instanceof HTMLElement)next.focus(); break; }
    case 'onboarding': state.onboarding++; persist(); render(); break;
    case 'restart-guide': state.onboarding = 0; persist(); closeDialog(); changeView('play'); break;
    case 'close': closeDialog(); break;
    case 'export': exportProgress(); break;
    case 'confirm-import': confirmImport(); break;
    case 'cancel-import': importCandidate = null; el('import-preview').replaceChildren(); el('import-feedback').textContent = 'Import canceled. Current progress is unchanged.'; break;
    case 'challenge': startChallenge(); break;
    case 'lock-now': confirmLock(); break;
    case 'confirm-lock': { const c = currentCall(); if (c) lockCall(c); closeDialog(); break; }
    case 'copy-link': { const field = /** @type {HTMLTextAreaElement} */ (el('challenge-link')); void copyText(field.value).then(ok => { if(ok)button.innerHTML=icon('check')+' Link copied'; toast(ok ? 'Link copied.' : 'Select and copy the link above.', 'Send it to your friend to keep the duel going.', 'copy'); }); break; }
    case 'accept-existing': acceptExisting(); break;
    case 'dismiss-duel': incoming = null; history.replaceState(null,'',location.pathname + location.search); render(); break;
    case 'away': showAway(); break;
    case 'dismiss-away': awayCalls = []; closeDialog(); render(); break;
  }
});
el('brand-mark').innerHTML = hamster('awake');
el('help-button').innerHTML = icon('help');
el('help-button').addEventListener('click', showHelp);
el('profile-button').addEventListener('click', showProfile);
el('sound-toggle').addEventListener('click', () => { state.sound = !state.sound; persist(); updateHeader(); playSound('call',state.sound); });
document.querySelector('.brand')?.addEventListener('click', event => { event.preventDefault(); changeView('play'); });
window.addEventListener('hashchange', () => { incoming = decodeChallenge(location.hash); handleIncoming(); render(); });
window.addEventListener('online', () => { void refresh(true); });
window.addEventListener('offline', () => { connection = 'offline'; render(); });
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { resumedAfterAway ||= backgroundAt > 0 && Date.now() - backgroundAt > 5 * MINUTE; backgroundAt = 0; void refresh(true); }
  else { backgroundAt = Date.now(); persist(); }
});
// Keep other tabs consistent without overwriting an in-progress nickname form.
window.addEventListener('storage', event => { if (event.key === 'nap-or-sprint:player:v1' && event.newValue) { try { state = validateState(JSON.parse(event.newValue)); draft.round = 0; render(); } catch { /* Keep the last good state. */ } } });
setInterval(() => {
  const c = currentCall(), w = currentWindow();
  if (c && !c.lockedAt && (Date.now() >= c.lockAt || knownClosed(c.round))) { c.lockedAt = Math.min(Date.now(),c.lockAt); persist(); render(); toast('Your call is now locked.', 'The real settlement will reveal the answer.', 'lock'); }
  else if (w && Date.now() >= w.lockAt && document.getElementById('call-nap') && !document.querySelector('.call-choices:disabled')) render();
  tickCountdown();
}, 1000);
setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10_000);
handleIncoming(); render();
if (location.hash.startsWith('#duel=') && !incoming) toast('This challenge link is incomplete or invalid.', 'Ask your friend to copy the full challenge link.', 'swords');
void refresh(true);
