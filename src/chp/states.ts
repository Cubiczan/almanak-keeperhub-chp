/**
 * Cubiczan CHP decision states.
 * Same names as the published agent-governance gate; this is an original
 * simplified implementation, not a copy of that package.
 */
export const CHP_STATES = [
  "EXPLORING",
  "PROVISIONAL",
  "LOCKED",
  "HITL_REQUIRED",
  "BLOCKED",
] as const;

export type ChpState = (typeof CHP_STATES)[number];

export type GateReason = {
  code: string;
  message: string;
};

export type GateDecision = {
  state: ChpState;
  trail: ChpState[];
  reasons: GateReason[];
  policyId: string;
  notionalUsd?: string;
  dailySpentUsd: string;
  dailyRemainingUsd: string;
};
