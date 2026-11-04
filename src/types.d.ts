export type Side = 'NAP' | 'SPRINT';
export type Bracket = '1-10' | '11-30' | '31-60' | '61+';
export interface Settlement {
  from: number; through: number; work: number; blocks: number;
  timestamp: number; hash: string; cumulativeWork?: number; source?: string;
}
export interface Bucket { start: number; end: number; count: number; active: number; work: number; blocks: number }
export interface Status {
  round: number | null; spinning: boolean; activity: 'SPINNING' | 'IDLE' | 'UNKNOWN'; freshness: string; rpm: number | null;
  speed: number | null; distance: number | null; openWork: number | null; mmPerPass: number | null;
  height: number | null; progress: number | null; closure: number | null;
  buffered: number | null; confirmedAt: number | null; generatedAt: number;
}
export interface Rival {
  round: number; call: Side; bracket: Bracket | null; confidence: number;
  probability: number; reason: string; samples: number; coarse: boolean; createdAt: number;
}
export interface Result {
  settlement: Settlement; correct: boolean; bracketCorrect: boolean;
  points: number; streak: number; rivalCorrect: boolean; rivalBracketCorrect: boolean;
  rivalPoints: number; rivalStreak: number;
}
export interface Call {
  round: number; call: Side; bracket: Bracket | null; createdAt: number; updatedAt: number;
  expectedAt: number; lockAt: number; lockedAt: number | null; rival: Rival;
  result?: Result;
}
export interface Challenge {
  nickname: string; round: number; call: Side; bracket: Bracket | null;
  versus?: Omit<Challenge, 'versus'>;
}
export interface Duel {
  id: string; round: number; opponent: string; theirCall: Side; theirBracket: Bracket | null;
  myCall: Side; myBracket: Bracket | null; createdAt: number; direction: 'sent' | 'received';
  reply?: string;
}
export interface State {
  version: 1; nickname: string; sound: boolean; onboarding: number;
  calls: Call[]; rivals: Rival[]; duels: Duel[]; sent: Challenge[]; achievements: Record<string, number>;
  gallery: number[]; lastSeen: number; createdAt: number;
}
export interface Cache {
  status: Status | null; settlements: Settlement[]; buckets: Bucket[];
  updatedAt: number; statusAt: number; historyAt: number;
  distanceBase: { round: number; distance: number; partial: boolean } | null;
}
export interface RoundWindow { round: number; expectedAt: number; lockAt: number; interval: number }
export interface Achievement { id: string; name: string; description: string; icon: string; color: string }
