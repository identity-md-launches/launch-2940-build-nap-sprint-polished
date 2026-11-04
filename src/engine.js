// @ts-check
/** @typedef {import('./types').State} State */
/** @typedef {import('./types').Call} Call */
/** @typedef {import('./types').Settlement} Settlement */
/** @typedef {import('./types').Bucket} Bucket */
/** @typedef {import('./types').Status} Status */
/** @typedef {import('./types').Rival} Rival */
/** @typedef {import('./types').Challenge} Challenge */
/** @typedef {import('./types').Bracket} Bracket */
/** @typedef {import('./types').Side} Side */

export const API = 'https://api.squeekchain.com/v1';
export const MINUTE = 60_000;
export const DAY = 86_400_000;
export const BRACKETS = /** @type {const} */ (['1-10', '11-30', '31-60', '61+']);
export const ACHIEVEMENTS = /** @type {import('./types').Achievement[]} */ ([
  { id: 'first', name: 'First Call', description: 'Make your first prediction.', icon: 'flag', color: 'peach' },
  { id: 'night', name: 'Night Owl', description: 'Make a correct call from 00:00–05:00 UTC.', icon: 'moon', color: 'lavender' },
  { id: 'hat', name: 'Hat Trick', description: 'Get 3 calls right in a row.', icon: 'hat', color: 'green' },
  { id: 'ten', name: 'Ten Streak', description: 'Get 10 calls right in a row.', icon: 'flame', color: 'peach' },
  { id: 'bracket', name: 'Bracket Master', description: 'Predict 5 block brackets exactly.', icon: 'target', color: 'green' },
  { id: 'professor', name: 'Beat the Professor', description: 'Finish a UTC week ahead of Whiskers.', icon: 'glasses', color: 'lavender' },
  { id: 'duel', name: 'Duelist', description: 'Win a friend duel.', icon: 'swords', color: 'peach' },
  { id: 'collector', name: 'Collector', description: 'Collect 10 round artworks.', icon: 'art', color: 'lavender' },
  { id: 'sleep', name: 'Sleep Whisperer', description: 'Correctly predict 5 naps.', icon: 'sleep', color: 'green' },
]);

/** Public JSON is an untrusted boundary. @param {unknown} value @returns {Record<string, any>} */
export function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
/** @param {unknown} value @returns {number | null} */
export function numeric(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
}
/** @param {unknown} value @returns {number | null} */
export function timestamp(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
/** @param {unknown} value */
export function validHash(value) { return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value); }
/** Archived mining checkpoints verify outcomes but do not provide the original settlement seed. @param {Settlement} settlement */
export function hasArtworkSeed(settlement) { return validHash(settlement.hash) && settlement.source !== 'checkpoint'; }
/** @param {Settlement} settlement */
function sourcePriority(settlement) { return settlement.source === 'checkpoint' ? 1 : settlement.source === 'anchor' ? 3 : 4; }
/** Prefer an original settlement over a checkpoint when either covers the round.
 * @param {number} round @param {Settlement[]} settlements */
export function settlementForRound(round, settlements) {
  return settlements.filter(s => s.from < round && s.through >= round).sort((a, b) => sourcePriority(b) - sourcePriority(a) || a.through - a.from - (b.through - b.from))[0];
}
/** @param {number} now @returns {State} */
export function newState(now = Date.now()) {
  return { version: 1, nickname: 'Wheel watcher', sound: false, onboarding: 0, calls: [], rivals: [], duels: [], sent: [], achievements: {}, gallery: [], lastSeen: now, createdAt: now };
}

/** @param {unknown} raw @returns {Status} */
export function normalizeStatus(raw) {
  const r = object(raw), m = object(r.measurement), b = object(r.builder), a = object(b.anchor);
  const through = numeric(a.settledThroughRound);
  return {
    round: through === null ? null : through + 1, spinning: m.coreStatus === 'SPINNING',
    activity: m.coreStatus === 'SPINNING' || m.coreStatus === 'IDLE' ? m.coreStatus : 'UNKNOWN',
    freshness: typeof m.freshness === 'string' ? m.freshness : 'unknown',
    rpm: numeric(m.rpmMilli) === null ? null : Number(m.rpmMilli) / 1000,
    speed: numeric(m.speedMmPerSecond), distance: numeric(m.distanceMm),
    openWork: numeric(object(b.queued).openRoundWorkUnits),
    mmPerPass: numeric(m.cumulativeWorkUnits) && numeric(m.distanceMm) !== null ? Number(m.distanceMm) / Number(m.cumulativeWorkUnits) : null,
    height: numeric(a.blockHeight), progress: numeric(a.blockProgress) === null ? null : Number(a.blockProgress) / 1e9,
    closure: numeric(object(object(r.oracle).latestClosure).lastRound),
    buffered: numeric(object(object(r.settlementQueue).buffered).lastRound),
    confirmedAt: timestamp(a.confirmedAt), generatedAt: timestamp(r.generatedAt) ?? Date.now(),
  };
}

/** @param {unknown} raw @returns {Settlement | null} */
function normalizeSettlement(raw) {
  const r = object(raw), from = numeric(r.previousSettledThroughRound), through = numeric(r.settledThroughRound);
  const work = numeric(r.workAdded), blocks = numeric(r.completedBlockCount), time = timestamp(r.blockTimestamp);
  if (from === null || through === null || through <= from || !Number.isInteger(through) || work === null || blocks === null || time === null) return null;
  return { from, through, work, blocks, timestamp: time, hash: validHash(r.transactionHash) ? r.transactionHash : '', cumulativeWork: numeric(r.cumulativeWork) ?? undefined, source: 'settlement' };
}

/** @param {unknown} raw @returns {{settlements: Settlement[], buckets: Bucket[]}} */
export function normalizeHistory(raw) {
  const r = object(raw);
  const settlements = (Array.isArray(r.recentSettlements) ? r.recentSettlements : []).map(normalizeSettlement).filter(/** @returns {s is Settlement} */ s => s !== null);
  // The current public feed archives inactive rounds. Consecutive public mining
  // checkpoints provide an exact cumulative-work delta, never an estimated result.
  const checkpoints = Array.isArray(object(r.mining).recentCheckpoints) ? r.mining.recentCheckpoints : [];
  const cumulative = new Map(settlements.filter(s => s.cumulativeWork !== undefined).map(s => [s.through, /** @type {number} */ (s.cumulativeWork)]));
  for (const rawPoint of checkpoints) {
    const p = object(rawPoint), round = numeric(p.throughRound), work = numeric(p.cumulativeWork);
    if (round !== null && work !== null) cumulative.set(round, work);
  }
  for (const rawPoint of checkpoints) {
    const p = object(rawPoint), from = numeric(p.afterRound), through = numeric(p.throughRound);
    const work = numeric(p.cumulativeWork), blocks = numeric(p.completedBlockCount), time = timestamp(p.blockTimestamp);
    const previous = from === null ? undefined : cumulative.get(from);
    if (from === null || through === null || through <= from || work === null || previous === undefined || work < previous || blocks === null || time === null) continue;
    if (!settlements.some(s => s.from === from && s.through === through)) settlements.push({ from, through, work: work - previous, blocks, timestamp: time, hash: validHash(p.transactionHash) ? p.transactionHash : '', cumulativeWork: work, source: 'checkpoint' });
  }
  /** @type {Bucket[]} */ const buckets = [];
  for (const rawBucket of Array.isArray(r.buckets) ? r.buckets : []) {
    const b = object(rawBucket), start = timestamp(b.startAt), end = timestamp(b.endAt);
    const count = numeric(b.settlementCount), active = numeric(b.activeRoundCount);
    if (start === null || end === null || end <= start || count === null || active === null) continue;
    buckets.push({ start, end, count, active: Math.min(count, active), work: numeric(b.workAdded) ?? 0, blocks: numeric(b.completedBlockCount) ?? 0 });
  }
  return { settlements: mergeSettlements([], settlements), buckets };
}

/** The latest anchor also has an exact delta when its predecessor is known.
 * @param {unknown} raw @param {Settlement[]} known @returns {Settlement[]} */
export function anchorSettlement(raw, known) {
  const s = object(object(raw).settlementQueue).latestSubmission, p = object(s), expected = object(p.expected);
  const from = numeric(p.previousSettledThroughRound), through = numeric(p.settledThroughRound);
  const total = numeric(expected.cumulativeWork), blocks = numeric(expected.completedBlockCount);
  const before = known.find(k => k.through === from)?.cumulativeWork;
  const a = object(object(object(raw).builder).anchor);
  const time = a.transactionHash === p.transactionHash && numeric(a.settledThroughRound) === through ? timestamp(a.confirmedAt) : timestamp(p.confirmedAt);
  if (p.lifecycle !== 'confirmed' || from === null || through === null || through <= from || total === null || before === undefined || total < before || blocks === null || time === null) return [];
  return [{ from, through, work: total - before, blocks, timestamp: time, hash: validHash(p.transactionHash) ? p.transactionHash : '', cumulativeWork: total, source: 'anchor' }];
}

/** @param {Settlement[]} previous @param {Settlement[]} incoming @param {number} [limit] @returns {Settlement[]} */
export function mergeSettlements(previous, incoming, limit = 6000) {
  const map = new Map(previous.map(s => [`${s.from}:${s.through}`, s]));
  for (const s of incoming) {
    const key = `${s.from}:${s.through}`, old = map.get(key);
    if (!old || sourcePriority(s) >= sourcePriority(old)) map.set(key, s);
  }
  return [...map.values()].sort((a, b) => a.through - b.through || b.from - a.from).slice(-limit);
}

/** @param {Status | null} status @param {Settlement[]} settlements @returns {import('./types').RoundWindow | null} */
export function roundWindow(status, settlements) {
  if (!status?.round) return null;
  const round = status.round;
  const sorted = settlements.filter(s => s.through < round).slice(-16);
  const gaps = sorted.slice(1).map((s, i) => (s.timestamp - sorted[i].timestamp) / (s.through - sorted[i].through)).filter(n => n >= 3 * MINUTE && n <= 30 * MINUTE).sort((a, b) => a - b);
  const interval = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 15 * MINUTE;
  const latest = [...sorted].reverse().find(s => s.through === round - 1);
  const anchorTime = latest?.timestamp ?? status.confirmedAt;
  if (!anchorTime) return null;
  const expectedAt = anchorTime + interval;
  return { round, expectedAt, lockAt: expectedAt - 2 * MINUTE, interval };
}

/** @param {number} blocks @returns {Bracket | null} */
export function blockBracket(blocks) {
  return blocks < 1 ? null : blocks <= 10 ? '1-10' : blocks <= 30 ? '11-30' : blocks <= 60 ? '31-60' : '61+';
}

/** @param {Bucket[]} buckets @param {number} now */
export function hourlyPattern(buckets, now = Date.now()) {
  const hours = Array.from({ length: 24 }, () => ({ active: 0, count: 0, coarse: false }));
  for (const b of buckets) {
    if (b.end <= now - 7 * DAY || b.start >= now || b.count === 0) continue;
    const observedEnd = Math.min(b.end, now), start = Math.max(b.start, now - 7 * DAY), duration = observedEnd - b.start;
    for (let h = Math.floor(start / (60 * MINUTE)) * 60 * MINUTE; h < observedEnd; h += 60 * MINUTE) {
      const overlap = Math.max(0, Math.min(h + 60 * MINUTE, observedEnd) - Math.max(h, start)) / duration;
      const hour = hours[new Date(h).getUTCHours()];
      hour.active += b.active * overlap; hour.count += b.count * overlap;
      hour.coarse ||= b.end - b.start > 60 * MINUTE;
    }
  }
  return hours.map(h => ({ probability: h.count ? h.active / h.count : null, count: h.count, coarse: h.coarse }));
}

/** @param {number} round @param {Settlement[]} settlements @param {Bucket[]} buckets @param {number} expectedAt @param {number} now @returns {Rival} */
export function makeRival(round, settlements, buckets, expectedAt, now = Date.now()) {
  const history = settlements.filter(s => s.through < round && s.timestamp >= now - 7 * DAY && s.timestamp <= now);
  const recent = history.slice(-3), hour = new Date(expectedAt).getUTCHours();
  const sameHour = history.filter(s => new Date(s.timestamp).getUTCHours() === hour);
  const pattern = hourlyPattern(buckets, now)[hour];
  const baseline = pattern.probability ?? (sameHour.length ? sameHour.filter(s => s.work > 0).length / sameHour.length : history.length ? history.filter(s => s.work > 0).length / history.length : 0.5);
  const momentum = recent.length ? recent.filter(s => s.work > 0).length / recent.length : baseline;
  const probability = Math.max(0.05, Math.min(0.95, 0.7 * baseline + 0.3 * momentum));
  const call = probability >= 0.5 ? 'SPRINT' : 'NAP';
  const active = history.filter(s => s.work > 0 && s.blocks > 0);
  const typical = [...active].sort((a, b) => a.blocks - b.blocks)[Math.floor(active.length / 2)];
  const bracket = call === 'SPRINT' ? blockBracket(typical?.blocks ?? 20) ?? '11-30' : null;
  const reason = history.length || pattern.count ? call === 'NAP' ? (momentum === 0 ? 'Three quiet rounds. Even my equations need a blanket.' : 'This hour usually favors a snooze. A scholarly snooze.') : (momentum > 0.66 ? 'The wheel has momentum. My spectacles are vibrating.' : 'History says wheel time. I have adjusted my bow tie.') : 'A coin flip in a lab coat. I need more history.';
  return { round, call, bracket, probability, confidence: Math.round(100 * (call === 'SPRINT' ? probability : 1 - probability)), reason, samples: Math.round(pattern.count || history.length), coarse: pattern.coarse, createdAt: now };
}

/** @param {Side} call @param {Bracket | null} bracket @param {Settlement} settlement */
export function accuracy(call, bracket, settlement) {
  const correct = call === (settlement.work > 0 ? 'SPRINT' : 'NAP');
  const bracketCorrect = correct && call === 'SPRINT' && bracket !== null && bracket === blockBracket(settlement.blocks);
  return { correct, bracketCorrect, base: (correct ? 10 : 0) + (bracketCorrect ? 15 : 0) };
}

/** Recompute in round order so recovered older results also repair streaks.
 * @param {State} state @param {Settlement[]} settlements @param {number} now */
export function reconcile(state, settlements, now = Date.now()) {
  /** @type {Call[]} */ const newlyResolved = [];
  let streak = 0, rivalStreak = 0;
  const known = mergeSettlements(state.calls.flatMap(c => c.result ? [c.result.settlement] : []), settlements, Infinity);
  state.calls.sort((a, b) => a.round - b.round);
  for (const c of state.calls) {
    if (!c.lockedAt && now >= c.lockAt) c.lockedAt = c.lockAt;
    const settlement = settlementForRound(c.round, known);
    if (!settlement) continue;
    const wasPending = !c.result;
    const yours = accuracy(c.call, c.bracket, settlement), rival = accuracy(c.rival.call, c.rival.bracket, settlement);
    streak = yours.correct ? streak + 1 : 0; rivalStreak = rival.correct ? rivalStreak + 1 : 0;
    c.lockedAt ??= Math.min(now, c.lockAt);
    c.result = { settlement, correct: yours.correct, bracketCorrect: yours.bracketCorrect, points: yours.base + 5 * streak, streak, rivalCorrect: rival.correct, rivalBracketCorrect: rival.bracketCorrect, rivalPoints: rival.base + 5 * rivalStreak, rivalStreak };
    if (wasPending) newlyResolved.push(c);
  }
  state.gallery = state.calls.filter(c => c.result?.correct && hasArtworkSeed(c.result.settlement)).map(c => c.round);
  const unlocked = unlockAchievements(state, now);
  return { newlyResolved, unlocked };
}

/** @param {number} time */
export function weekStart(time) {
  const d = new Date(time); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.getTime();
}
/** @param {State} state @param {number} start */
export function weekScore(state, start = weekStart(Date.now())) {
  const calls = state.calls.filter(c => c.result && c.result.settlement.timestamp >= start && c.result.settlement.timestamp < start + 7 * DAY);
  return { player: calls.reduce((n, c) => n + (c.result?.points ?? 0), 0), professor: calls.reduce((n, c) => n + (c.result?.rivalPoints ?? 0), 0), rounds: calls.length };
}
/** @param {import('./types').Duel} duel @param {Settlement[]} settlements */
export function duelResult(duel, settlements) {
  const settlement = settlementForRound(duel.round, settlements);
  if (!settlement) return null;
  const yours = accuracy(duel.myCall, duel.myBracket, settlement).base, theirs = accuracy(duel.theirCall, duel.theirBracket, settlement).base;
  return { yours, theirs, outcome: yours === theirs ? 'draw' : yours > theirs ? 'win' : 'loss', settlement };
}
/** @param {State} state @param {number} now */
export function unlockAchievements(state, now = Date.now()) {
  const resolved = state.calls.filter(c => c.result), correct = resolved.filter(c => c.result?.correct);
  const completedWeeks = [...new Set(resolved.map(c => weekStart(/** @type {NonNullable<Call['result']>} */ (c.result).settlement.timestamp)))].filter(w => w < weekStart(now));
  const allSettlements = resolved.map(c => /** @type {NonNullable<Call['result']>} */ (c.result).settlement);
  /** @type {Record<string, boolean>} */ const checks = {
    first: state.calls.length > 0,
    night: correct.some(c => new Date(c.updatedAt).getUTCHours() < 5),
    hat: correct.some(c => (c.result?.streak ?? 0) >= 3),
    ten: correct.some(c => (c.result?.streak ?? 0) >= 10),
    bracket: resolved.filter(c => c.result?.bracketCorrect).length >= 5,
    professor: completedWeeks.some(w => { const s = weekScore(state, w); return s.rounds > 0 && s.player > s.professor; }),
    duel: state.duels.some(d => duelResult(d, allSettlements)?.outcome === 'win'),
    collector: state.gallery.length >= 10,
    sleep: correct.filter(c => c.call === 'NAP').length >= 5,
  };
  const unlocked = ACHIEVEMENTS.filter(a => checks[a.id] && !state.achievements[a.id]);
  for (const a of unlocked) state.achievements[a.id] = now;
  return unlocked;
}

/** @param {string} name */
export function cleanNickname(name) { return name.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 24) || 'Wheel watcher'; }
/** @param {unknown} raw @returns {Challenge | null} */
export function validateChallenge(raw) {
  const r = object(raw), round = numeric(r.round);
  if (typeof r.nickname !== 'string' || !r.nickname.trim() || r.nickname.length > 24 || round === null || !Number.isInteger(round) || round < 1 || round > 1e9 || !['NAP', 'SPRINT'].includes(r.call)) return null;
  if (r.call === 'SPRINT' && !BRACKETS.includes(r.bracket)) return null;
  /** @type {Challenge} */ const c = { nickname: cleanNickname(r.nickname), round, call: r.call, bracket: r.call === 'SPRINT' ? r.bracket : null };
  if (r.versus) {
    const v = object(r.versus);
    if (v.versus) return null;
    const versus = validateChallenge(v);
    if (!versus || versus.round !== c.round) return null;
    c.versus = versus;
  }
  return c;
}
/** @param {Challenge} challenge */
export function encodeChallenge(challenge) {
  const bytes = new TextEncoder().encode(JSON.stringify(challenge));
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** @param {string} hash @returns {Challenge | null} */
export function decodeChallenge(hash) {
  try {
    if (!hash.startsWith('#duel=') || hash.length > 4096) return null;
    const base = hash.slice(6).replace(/-/g, '+').replace(/_/g, '/');
    return validateChallenge(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(base), c => c.charCodeAt(0)))));
  } catch { return null; }
}

/** @param {unknown} raw @param {number} [fallbackTime] @returns {Rival | null} */
function readRival(raw, fallbackTime = Date.now()) {
  const rv = object(raw), pick = validateChallenge({ nickname: 'Professor', round: rv.round, call: rv.call, bracket: rv.bracket });
  const confidence = numeric(rv.confidence), probability = numeric(rv.probability);
  if (!pick || confidence === null || confidence < 50 || confidence > 100 || probability !== null && probability > 1) return null;
  return { round: pick.round, call: pick.call, bracket: pick.bracket, confidence, probability: probability ?? .5, reason: typeof rv.reason === 'string' ? rv.reason.slice(0, 200) : '', samples: numeric(rv.samples) ?? 0, coarse: rv.coarse === true, createdAt: timestamp(rv.createdAt) ?? fallbackTime };
}

/** Validate every saved field rather than merging arbitrary imported properties.
 * @param {unknown} raw @returns {State} */
export function validateState(raw) {
  const r = object(raw);
  if (r.version !== 1 || !Array.isArray(r.calls) || r.calls.length > 10000 || typeof r.nickname !== 'string') throw new Error('Choose a Nap or Sprint? version 1 progress file.');
  const state = newState();
  state.nickname = cleanNickname(r.nickname); state.sound = r.sound === true;
  state.onboarding = Math.min(3, Math.max(0, Math.floor(numeric(r.onboarding) ?? 0)));
  state.createdAt = timestamp(r.createdAt) ?? Date.now(); state.lastSeen = timestamp(r.lastSeen) ?? Date.now();
  const seen = new Set();
  for (const rawCall of r.calls) {
    const c = object(rawCall), pick = validateChallenge({ nickname: state.nickname, round: c.round, call: c.call, bracket: c.bracket });
    const createdAt = timestamp(c.createdAt), expectedAt = timestamp(c.expectedAt), lockAt = timestamp(c.lockAt);
    if (!pick || seen.has(pick.round) || !createdAt || !expectedAt || !lockAt) throw new Error('The file contains an invalid or duplicate call.');
    if (lockAt > expectedAt || createdAt > lockAt) throw new Error('The file contains a call made after its deadline.');
    seen.add(pick.round);
    const rival = readRival(c.rival, createdAt);
    if (!rival || rival.round !== pick.round) throw new Error('The file contains an invalid Professor prediction.');
    /** @type {Call} */ const call = { round: pick.round, call: pick.call, bracket: pick.bracket, createdAt, updatedAt: timestamp(c.updatedAt) ?? createdAt, expectedAt, lockAt, lockedAt: timestamp(c.lockedAt), rival };
    if (c.result) {
      const s = object(object(c.result).settlement);
      const settled = normalizeSettlement({ previousSettledThroughRound: s.from, settledThroughRound: s.through, workAdded: s.work, completedBlockCount: s.blocks, blockTimestamp: s.timestamp, transactionHash: s.hash, cumulativeWork: s.cumulativeWork });
      if (!settled || !(settled.from < call.round && settled.through >= call.round)) throw new Error('The file contains an invalid settlement.');
      settled.source = s.source === 'checkpoint' || s.source === 'anchor' ? s.source : 'settlement';
      // Points and streaks are reconstructed below, never trusted from JSON.
      const a = accuracy(call.call, call.bracket, settled);
      call.result = { settlement: settled, correct: a.correct, bracketCorrect: a.bracketCorrect, points: 0, streak: 0, rivalCorrect: false, rivalBracketCorrect: false, rivalPoints: 0, rivalStreak: 0 };
    }
    state.calls.push(call);
  }
  for (const rawDuel of Array.isArray(r.duels) ? r.duels.slice(0, 5000) : []) {
    const d = object(rawDuel), yours = validateChallenge({ nickname: state.nickname, round: d.round, call: d.myCall, bracket: d.myBracket }), theirs = validateChallenge({ nickname: d.opponent, round: d.round, call: d.theirCall, bracket: d.theirBracket });
    const call = state.calls.find(c => c.round === d.round);
    if (!yours || !theirs || !call?.lockedAt || call.call !== yours.call || call.bracket !== yours.bracket) throw new Error('The file contains a duel without a matching locked call.');
    state.duels.push({ id: `${d.round}:${encodeChallenge(theirs)}`, round: d.round, opponent: theirs.nickname, theirCall: theirs.call, theirBracket: theirs.bracket, myCall: yours.call, myBracket: yours.bracket, createdAt: timestamp(d.createdAt) ?? Date.now(), direction: d.direction === 'sent' ? 'sent' : 'received' });
  }
  // Keep only known badge IDs; completed earned badges are durable across imports.
  for (const a of ACHIEVEMENTS) if (timestamp(object(r.achievements)[a.id])) state.achievements[a.id] = r.achievements[a.id];
  const forecasts = new Map();
  for (const rawRival of Array.isArray(r.rivals) ? r.rivals.slice(-6000) : []) { const rival = readRival(rawRival); if (rival) forecasts.set(rival.round, rival); }
  for (const c of state.calls) forecasts.set(c.round, c.rival);
  state.rivals = [...forecasts.values()];
  state.sent = (Array.isArray(r.sent) ? r.sent : []).map(validateChallenge).filter(/** @returns {c is Challenge} */ c => c !== null && !c.versus && state.calls.some(p => p.round === c.round && p.lockedAt && p.call === c.call && p.bracket === c.bracket));
  const savedAchievements = { ...state.achievements };
  reconcile(state, [], Date.now());
  // The caller announces newly earned badges. Validation only reconstructs scores.
  state.achievements = savedAchievements;
  return state;
}
