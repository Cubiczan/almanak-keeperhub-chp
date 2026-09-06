import type { ExecutionPlan } from "../almanak/adapter.js";
import { addDecimal, compareDecimal, subDecimal } from "../lib/money.js";
import { chainAllowed, type Policy } from "./policy.js";
import type { ChpState, GateDecision, GateReason } from "./states.js";

export type GateInput = {
  plan: ExecutionPlan;
  policy: Policy;
  dailySpentUsd: string;
};

/**
 * Fail-closed CHP gate.
 * EXPLORING → PROVISIONAL → LOCKED | HITL_REQUIRED | BLOCKED
 */
export function evaluateGate(input: GateInput): GateDecision {
  const { plan, policy, dailySpentUsd } = input;
  const trail: ChpState[] = ["EXPLORING"];
  const reasons: GateReason[] = [];

  if (plan.kind === "hold") {
    reasons.push({ code: "hold", message: "Almanak strategy returned Intent.hold — no capital move." });
    return finish("EXPLORING", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  trail.push("PROVISIONAL");

  if (!plan.notionalUsd) {
    reasons.push({ code: "missing_notional", message: "Fail-closed: Almanak intent has no resolvable USD notional." });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (plan.chainId === undefined) {
    reasons.push({
      code: "unknown_chain",
      message: `Fail-closed: cannot resolve Almanak chain "${plan.intent.chain ?? ""}" to a KeeperHub chain id.`,
    });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (!chainAllowed(policy, plan.chainId, plan.intent.chain)) {
    reasons.push({
      code: "chain_not_allowlisted",
      message: `Chain ${plan.chainLabel ?? plan.chainId} is not in the policy allowlist.`,
    });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (!plan.venue) {
    reasons.push({ code: "missing_venue", message: "Fail-closed: intent has no protocol/venue." });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (!policy.allowedVenues.has(plan.venue.toLowerCase())) {
    reasons.push({
      code: "venue_not_allowlisted",
      message: `Venue "${plan.venue}" is not in the policy allowlist.`,
    });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (policy.allowedTokens.size > 0) {
    for (const token of plan.tokens) {
      if (!policy.allowedTokens.has(token.toUpperCase())) {
        reasons.push({
          code: "token_not_allowlisted",
          message: `Token ${token} is not in the policy allowlist.`,
        });
        return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
      }
    }
  }

  if (compareDecimal(plan.notionalUsd, policy.maxNotionalUsd) > 0) {
    reasons.push({
      code: "max_notional",
      message: `Notional ${plan.notionalUsd} USD exceeds max_notional_usd ${policy.maxNotionalUsd}.`,
    });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  const projected = addDecimal(dailySpentUsd, plan.notionalUsd);
  if (compareDecimal(projected, policy.dailyCapUsd) > 0) {
    reasons.push({
      code: "daily_cap",
      message: `Daily spent ${dailySpentUsd} + ${plan.notionalUsd} exceeds daily_cap_usd ${policy.dailyCapUsd}.`,
    });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  const confidence = plan.confidence;
  if (!confidence) {
    reasons.push({
      code: "missing_confidence",
      message: "Fail-closed: strategy did not attach a confidence score.",
    });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (compareDecimal(confidence, policy.minConfidence) < 0) {
    reasons.push({
      code: "min_confidence",
      message: `Confidence ${confidence} is below min_confidence ${policy.minConfidence}.`,
    });
    const state = policy.hitlOnLowConfidence ? "HITL_REQUIRED" : "BLOCKED";
    return finish(state, trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (compareDecimal(plan.notionalUsd, policy.hitlNotionalUsd) >= 0) {
    reasons.push({
      code: "hitl_threshold",
      message: `Notional ${plan.notionalUsd} USD is at/above hitl_notional_usd ${policy.hitlNotionalUsd}.`,
    });
    return finish("HITL_REQUIRED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  if (!plan.keeperHub) {
    reasons.push({
      code: "missing_execution_plan",
      message: "Fail-closed: adapter did not produce a KeeperHub payload.",
    });
    return finish("BLOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
  }

  reasons.push({
    code: "locked",
    message: `CHP LOCKED ${plan.notionalUsd} USD on ${plan.chainLabel} via ${plan.venue}.`,
  });
  return finish("LOCKED", trail, reasons, policy, plan.notionalUsd, dailySpentUsd);
}

function finish(
  state: ChpState,
  trail: ChpState[],
  reasons: GateReason[],
  policy: Policy,
  notionalUsd: string | undefined,
  dailySpentUsd: string,
): GateDecision {
  if (trail[trail.length - 1] !== state) trail.push(state);
  const remaining =
    compareDecimal(policy.dailyCapUsd, dailySpentUsd) >= 0
      ? subDecimal(policy.dailyCapUsd, dailySpentUsd)
      : "0";
  return {
    state,
    trail,
    reasons,
    policyId: policy.policyId,
    notionalUsd,
    dailySpentUsd,
    dailyRemainingUsd: remaining,
  };
}
