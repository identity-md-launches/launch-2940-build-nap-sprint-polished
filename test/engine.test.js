import test from 'node:test';
import assert from 'node:assert/strict';
import { numeric, normalizeStatus, normalizeHistory, anchorSettlement, mergeSettlements, roundWindow, blockBracket, hourlyPattern, makeRival, accuracy, newState, reconcile, weekStart, weekScore, duelResult, encodeChallenge, decodeChallenge, validateState, MINUTE, DAY } from '../src/engine.js';
import { fixture, settlement, NOW, hash } from './fixtures.js';

function call(round, side = 'NAP', bracket = null, createdAt = NOW) {
  return { round, call: side, bracket, createdAt, updatedAt: createdAt, expectedAt: createdAt + 15 * MINUTE, lockAt: createdAt + 13 * MINUTE, lockedAt: null, rival: { round, call: 'NAP', bracket: null, confidence: 70, probability: .3, reason: 'Test forecast', samples: 10, coarse: false, createdAt } };
}
function normalized(round, work = 0, blocks = 0, time = NOW + 15 * MINUTE) { return normalizeHistory({ recentSettlements: [settlement(round, work, blocks, time)] }).settlements[0]; }

test('missing or malformed numeric fields are unknown, never a made-up nap', () => {
  for (const bad of [null, undefined, '', ' ', [], {}, true, NaN, Infinity, -1]) assert.equal(numeric(bad), null);
  assert.equal(numeric('0'), 0);
  assert.equal(normalizeStatus({}).round, null);
  assert.equal(normalizeStatus({}).activity, 'UNKNOWN');
  assert.equal(normalizeHistory({ recentSettlements: [{ settledThroughRound: 1 }] }).settlements.length, 0);
});
test('real response shapes normalize strings, milli-rpm and block progress', () => {
  const f = fixture(), s = normalizeStatus(f.status), h = normalizeHistory(f.history);
  assert.equal(s.round, 2001); assert.equal(s.rpm, 22.5); assert.equal(s.progress, .34); assert.equal(s.mmPerPass, 51);
  assert.equal(h.settlements.length, 4); assert.equal(h.buckets.length, 28);
});
test('round number follows the builder anchor and cadence uses median round spacing', () => {
  const f = fixture(), s = normalizeStatus(f.status); s.closure = 2010; s.buffered = 2020;
  const w = roundWindow(s, normalizeHistory(f.history).settlements);
  assert.equal(w.round, 2001); assert.equal(w.interval, 15 * MINUTE); assert.equal(w.lockAt, NOW + 11 * MINUTE);
  assert.equal(roundWindow(null, []), null);
  assert.equal(roundWindow({ ...s, confirmedAt: null }, []), null);
});
test('checkpoint fallback requires an exact predecessor cumulative-work total', () => {
  const raw = { recentSettlements: [settlement(4, 40, 4)], mining: { recentCheckpoints: [{ afterRound: '4', throughRound: '5', cumulativeWork: '400', completedBlockCount: '0', blockTimestamp: new Date(NOW).toISOString(), transactionHash: hash(5) }, { afterRound: '9', throughRound: '10', cumulativeWork: '900', completedBlockCount: '0', blockTimestamp: new Date(NOW).toISOString(), transactionHash: hash(10) }] } };
  const data = normalizeHistory(raw).settlements;
  assert.equal(data.find(s => s.through === 5).work, 0); assert.equal(data.some(s => s.through === 10), false);
  const latest = anchorSettlement({ settlementQueue: { latestSubmission: { lifecycle: 'confirmed', previousSettledThroughRound: '5', settledThroughRound: '6', expected: { cumulativeWork: '400', completedBlockCount: '0' }, confirmedAt: new Date(NOW).toISOString(), transactionHash: hash(6) } } }, data);
  assert.equal(latest[0].work, 0);
});
test('settlement records outrank fallback checkpoints and are deduplicated', () => {
  const s = normalized(1, 10, 1);
  const merged = mergeSettlements([s], [{ ...s, source: 'checkpoint', timestamp: NOW + 20000 }]);
  assert.equal(merged.length, 1); assert.equal(merged[0].source, 'settlement');
});
test('all block bracket boundaries, including a sprint with zero blocks', () => {
  assert.deepEqual([0,1,10,11,30,31,60,61,1000].map(blockBracket), [null,'1-10','1-10','11-30','11-30','31-60','31-60','61+','61+']);
  assert.deepEqual(accuracy('SPRINT', '1-10', normalized(1, 2, 0)), { correct: true, bracketCorrect: false, base: 10 });
  assert.equal(accuracy('NAP', null, normalized(1, 2, 0)).base, 0);
});
test('correct calls, exact brackets, streak bonuses, misses and missed rounds score correctly', () => {
  const state = newState(NOW);
  state.calls = [call(1),call(2,'SPRINT','11-30'),call(4,'NAP'),call(5,'NAP'),call(6,'NAP')];
  const data = [normalized(1), normalized(2,200,20), normalized(4), normalized(5,10,1), normalized(6)];
  reconcile(state,data,NOW+2*DAY);
  assert.deepEqual(state.calls.map(c=>c.result.points), [15,35,25,0,15]);
  assert.deepEqual(state.calls.map(c=>c.result.streak), [1,2,3,0,1]);
  assert.ok(state.achievements.first); assert.ok(state.achievements.hat); assert.equal(state.gallery.length,4);
  assert.deepEqual(state.calls.map(c=>c.result.rivalPoints),[15,0,15,0,15]);
});
test('covering settlements resolve a whole batch; unknown rounds stay pending offline', () => {
  const state = newState(NOW); state.calls = [call(10),call(11),call(15)];
  const s = { ...normalized(12), from:9 };
  const result = reconcile(state,[s],NOW+DAY);
  assert.equal(result.newlyResolved.length,2); assert.equal(state.calls[2].result,undefined);
  assert.equal(reconcile(state,[],NOW+2*DAY).newlyResolved.length,0); assert.equal(state.calls[2].result,undefined);
});
test('recovering an older result repairs subsequent streaks without double scoring', () => {
  const state = newState(NOW); state.calls = [call(1),call(2)];
  reconcile(state,[normalized(2)],NOW+DAY); assert.equal(state.calls[1].result.points,15);
  reconcile(state,[normalized(1)],NOW+DAY); assert.equal(state.calls[1].result.points,20);
  assert.equal(state.gallery.length,2); assert.equal(reconcile(state,[normalized(1)],NOW+DAY).newlyResolved.length,0);
});
test('seven-day coarse buckets produce 24 honest estimates and momentum blends 70/30', () => {
  const f=fixture(), h=normalizeHistory(f.history), p=hourlyPattern(h.buckets,NOW);
  assert.equal(p.length,24); assert.ok(p.every(h=>h.coarse));
  const rival=makeRival(2001,h.settlements,h.buckets,NOW+13*MINUTE,NOW);
  const base=p[new Date(NOW+13*MINUTE).getUTCHours()].probability;
  assert.ok(Math.abs(rival.probability - (base*.7 + 1/3*.3))<.0001);
  assert.ok(rival.confidence>=50 && rival.confidence<=95);
  assert.equal(makeRival(1,[],[],NOW,NOW).confidence,50);
});
test('UTC weeks start on Monday and the Professor badge waits for the week to finish', () => {
  const start=weekStart(NOW); assert.equal(new Date(start).getUTCDay(),1); assert.equal(new Date(start).getUTCHours(),0);
  const state=newState(NOW); state.calls=[call(1,'SPRINT','11-30')];
  reconcile(state,[normalized(1,200,20)],NOW+DAY);
  assert.equal(weekScore(state,start).player,30); assert.equal(state.achievements.professor,undefined);
  reconcile(state,[],start+7*DAY); assert.ok(state.achievements.professor);
});
test('night, nap, bracket and collector achievements unlock from actual results', () => {
  const state=newState(NOW), night=Date.UTC(2026,10,4,1);
  state.calls=Array.from({length:10},(_,i)=>call(i+1,i<5?'NAP':'SPRINT',i<5?null:'11-30',night+i*MINUTE));
  const data=state.calls.map(c=>normalized(c.round,c.call==='NAP'?0:100,c.call==='NAP'?0:20));
  reconcile(state,data,NOW+DAY);
  for(const id of ['night','sleep','bracket','collector','ten']) assert.ok(state.achievements[id],id);
});
test('duels compare base accuracy fairly and keep pending results unknown', () => {
  const duel={id:'one',round:1,opponent:'Mina',theirCall:'NAP',theirBracket:null,myCall:'SPRINT',myBracket:'11-30',createdAt:NOW,direction:'received'};
  assert.equal(duelResult(duel,[]),null); assert.equal(duelResult(duel,[normalized(1,100,20)]).outcome,'win');
  const state=newState(NOW); state.calls=[call(1,'SPRINT','11-30')]; state.duels=[duel]; reconcile(state,[normalized(1,100,20)],NOW+DAY); assert.ok(state.achievements.duel);
});
test('UTF-8 challenge and reply links roundtrip; malformed, giant and recursive payloads are rejected', () => {
  const c={nickname:'Café 雪',round:2001,call:'SPRINT',bracket:'11-30'};
  assert.deepEqual(decodeChallenge('#duel='+encodeChallenge(c)),c);
  const reply={nickname:'Mina',round:2001,call:'NAP',bracket:null,versus:c};
  assert.deepEqual(decodeChallenge('#duel='+encodeChallenge(reply)),reply);
  for(const h of ['#duel=nope','#duel='+ 'a'.repeat(4100),'#anything']) assert.equal(decodeChallenge(h),null);
  assert.equal(decodeChallenge('#duel='+encodeChallenge({...c,versus:{...c,versus:c}})),null);
});
test('JSON imports validate structure, recompute points, preserve progress and reject bad deadlines', () => {
  const state=newState(NOW); state.calls=[call(1)]; reconcile(state,[normalized(1)],NOW+DAY);
  const raw=JSON.parse(JSON.stringify(state)); raw.calls[0].result.points=999999;
  const imported=validateState(raw); assert.equal(imported.calls[0].result.points,15); assert.deepEqual(imported.gallery,[1]);
  assert.throws(()=>validateState({version:2,calls:[],nickname:'Mina'}));
  assert.throws(()=>validateState({...raw,calls:[...raw.calls,...raw.calls]}));
  assert.throws(()=>validateState({...raw,calls:[{...raw.calls[0],createdAt:NOW+DAY}]}));
  assert.throws(()=>validateState({...raw,calls:[{...raw.calls[0],result:{settlement:{}}}]}));
});
test('an unplayed Professor forecast survives a reload, and new badges can still be announced', () => {
  const state=newState(NOW), f=fixture(), h=normalizeHistory(f.history);
  state.rivals=[makeRival(2001,h.settlements,h.buckets,NOW+15*MINUTE,NOW)];
  const restored=validateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored.rivals,state.rivals);
  state.calls=[call(1)]; state.achievements={};
  const pending=validateState(JSON.parse(JSON.stringify(state)));
  assert.equal(pending.achievements.first,undefined);
  assert.equal(reconcile(pending,[],NOW).unlocked[0].id,'first');
});
test('checkpoint outcomes never substitute a different transaction for an artwork seed', () => {
  const state=newState(NOW); state.calls=[call(1)];
  const checkpoint={...normalized(1),source:'checkpoint',hash:hash(100)};
  reconcile(state,[checkpoint],NOW+DAY);
  assert.equal(state.calls[0].result.points,15); assert.equal(state.gallery.length,0);
  const restored=validateState(JSON.parse(JSON.stringify(state))); assert.equal(restored.gallery.length,0);
  const original={...normalized(1),source:'anchor'};
  reconcile(state,[original],NOW+DAY); assert.deepEqual(state.gallery,[1]);
  reconcile(state,[checkpoint],NOW+DAY); assert.equal(state.calls[0].result.settlement.hash,original.hash); assert.deepEqual(state.gallery,[1]);
});
test('Night Owl uses the time of the final call update, with an exclusive 05:00 UTC boundary', () => {
  const state=newState(NOW); const c=call(1,'NAP',null,Date.UTC(2026,10,4,4,59));
  c.updatedAt=Date.UTC(2026,10,4,5,0); state.calls=[c];
  reconcile(state,[normalized(1)],NOW+DAY); assert.equal(state.achievements.night,undefined);
});
