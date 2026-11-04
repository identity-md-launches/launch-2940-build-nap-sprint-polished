// @ts-check
import { newState, validateState, object, numeric, timestamp } from './engine.js';
export const STATE_KEY = 'nap-or-sprint:player:v1';
export const CACHE_KEY = 'nap-or-sprint:data:v1';
export let storageIssue = '';
/** @returns {import('./types').State} */
export function loadState() {
  try { const saved = localStorage.getItem(STATE_KEY); return saved ? validateState(JSON.parse(saved)) : newState(); }
  catch { storageIssue = 'Saved progress could not be read. Export this session before closing; the previous save has been left untouched.'; return newState(); }
}
/** @returns {import('./types').Cache} */
export function emptyCache() { return { status: null, settlements: [], buckets: [], updatedAt: 0, statusAt: 0, historyAt: 0, distanceBase: null }; }
/** @returns {import('./types').Cache} */
export function loadCache() {
  try {
    const raw = object(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'));
    const cache = emptyCache();
    // Only this application's normalized cache is read; all fields are checked.
    if (raw.status && typeof raw.status.spinning === 'boolean' && numeric(raw.status.round) !== null) {
      const s = object(raw.status);
      cache.status = { round: numeric(s.round), spinning: s.spinning, activity: s.activity === 'SPINNING' || s.activity === 'IDLE' ? s.activity : 'UNKNOWN', freshness: typeof s.freshness === 'string' ? s.freshness : 'unknown', rpm: numeric(s.rpm), speed: numeric(s.speed), distance: numeric(s.distance), openWork: numeric(s.openWork), mmPerPass: numeric(s.mmPerPass), height: numeric(s.height), progress: numeric(s.progress), closure: numeric(s.closure), buffered: numeric(s.buffered), confirmedAt: timestamp(s.confirmedAt), generatedAt: timestamp(s.generatedAt) ?? 0 };
    }
    cache.settlements = (Array.isArray(raw.settlements) ? raw.settlements : []).filter(s => s && numeric(s.from) !== null && numeric(s.through) !== null && s.through > s.from && numeric(s.work) !== null && numeric(s.blocks) !== null && timestamp(s.timestamp) !== null && typeof s.hash === 'string').slice(-6000);
    cache.buckets = (Array.isArray(raw.buckets) ? raw.buckets : []).filter(b => b && timestamp(b.start) && timestamp(b.end) && b.end > b.start && numeric(b.count) !== null && numeric(b.active) !== null).slice(-2000);
    cache.updatedAt = timestamp(raw.updatedAt) ?? 0; cache.statusAt = timestamp(raw.statusAt) ?? 0; cache.historyAt = timestamp(raw.historyAt) ?? 0;
    if (raw.distanceBase && numeric(raw.distanceBase.round) !== null && numeric(raw.distanceBase.distance) !== null) cache.distanceBase = { round: raw.distanceBase.round, distance: raw.distanceBase.distance, partial: raw.distanceBase.partial !== false };
    return cache;
  } catch { return emptyCache(); }
}
/** @param {import('./types').State} state @param {boolean} [force] */
export function saveState(state, force = false) {
  if (storageIssue && !force) return false;
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); storageIssue = ''; return true; }
  catch { storageIssue = 'Browser storage is full or unavailable. Export your progress to keep this session.'; return false; }
}
/** @param {import('./types').Cache} cache */
export function saveCache(cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* A data cache failure must not erase player progress. */ } }
