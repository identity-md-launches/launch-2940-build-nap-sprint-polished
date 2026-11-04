// Explicitly synthetic data for automated checks only. Never imported by the game.
export const NOW = Date.UTC(2026, 10, 4, 12, 0);
export const hash = n => '0x' + n.toString(16).padStart(64, '0');
export function settlement(round, work = 0, blocks = 0, time = NOW - 2 * 60_000) {
  return { previousSettledThroughRound: String(round - 1), settledThroughRound: String(round), workAdded: String(work), completedBlockCount: String(blocks), cumulativeWork: String(round * 100), blockTimestamp: new Date(time).toISOString(), transactionHash: hash(round) };
}
export function fixture(now = NOW, through = 2000, spinning = true) {
  const latestTime = now - 2 * 60_000;
  const recentSettlements = [settlement(through, 0, 0, latestTime), settlement(through - 1, 210, 20, latestTime - 15 * 60_000), settlement(through - 2, 0, 0, latestTime - 30 * 60_000), settlement(through - 3, 110, 10, latestTime - 45 * 60_000)];
  const buckets = Array.from({ length: 28 }, (_, i) => ({ startAt: new Date(now - (28-i) * 6 * 60 * 60_000).toISOString(), endAt: new Date(now - (27-i) * 6 * 60 * 60_000).toISOString(), settlementCount: '24', activeRoundCount: String(i % 4 === 3 ? 18 : 3), workAdded: '1200', completedBlockCount: '100' }));
  return {
    status: { generatedAt: new Date(now).toISOString(), measurement: { coreStatus: spinning ? 'SPINNING' : 'IDLE', freshness: 'online', rpmMilli: spinning ? 22500 : 0, speedMmPerSecond: spinning ? 42 : 0, distanceMm: 51000, cumulativeWorkUnits: '1000' }, builder: { anchor: { settledThroughRound: String(through), confirmedAt: new Date(latestTime).toISOString(), blockHeight: '18000', blockProgress: '340000000' }, queued: { openRoundWorkUnits: '24' } }, oracle: { latestClosure: { lastRound: String(through) } }, settlementQueue: { buffered: { lastRound: null } } },
    history: { status: 'available', range: '7d', generatedAt: new Date(now).toISOString(), recentSettlements, buckets },
  };
}
