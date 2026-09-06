import { compileAlmanakIntent, type ExecutionPlan } from "./almanak/adapter.js";
import type { AlmanakIntent } from "./almanak/intents.js";
import type { MarketSnapshot } from "./almanak/market.js";
import type { IntentStrategy } from "./almanak/strategy.js";
import { evaluateGate } from "./chp/gate.js";
import { HmacAuditLedger, type LedgerEntry } from "./chp/ledger.js";
import type { Policy } from "./chp/policy.js";
import type { GateDecision } from "./chp/states.js";
import type { AppConfig } from "./lib/config.js";
import { createKeeperHub } from "./keeperhub/client.js";
import type { ExecuteResult, KeeperHubExecutor, SimulateResult } from "./keeperhub/types.js";

export type PipelineResult = {
  strategyName: string;
  intent: AlmanakIntent | null;
  plan?: ExecutionPlan;
  decision?: GateDecision;
  simulation?: SimulateResult;
  execution?: ExecuteResult;
  ledgerEntry?: LedgerEntry;
  skipped: boolean;
};

export async function runGovernedCycle(input: {
  strategy: IntentStrategy;
  market: MarketSnapshot;
  policy: Policy;
  config: AppConfig;
  ledger: HmacAuditLedger;
  keeperhub?: KeeperHubExecutor;
}): Promise<PipelineResult> {
  const { strategy, market, policy, config, ledger } = input;
  const keeperhub = input.keeperhub ?? createKeeperHub(config);
  const intent = strategy.decide(market);

  if (!intent) {
    return { strategyName: strategy.name, intent: null, skipped: true };
  }

  const plan = compileAlmanakIntent({
    intent,
    market,
    config,
    strategyName: strategy.name,
  });

  const decision = evaluateGate({
    plan,
    policy,
    dailySpentUsd: ledger.dailySpentUsd(),
  });

  let simulation: SimulateResult | undefined;
  let execution: ExecuteResult | undefined;

  if (decision.state === "LOCKED" && plan.keeperHub) {
    const req = {
      chainId: plan.keeperHub.chainId,
      recipientAddress: plan.keeperHub.recipientAddress,
      amount: plan.keeperHub.amount,
      tokenAddress: plan.keeperHub.tokenAddress,
      taskId: `${intent.intentId}|${new Date().toISOString().slice(0, 10)}`,
    };
    simulation = await keeperhub.simulateTransfer(req);
    if (simulation.success && !simulation.wouldRevert) {
      execution = await keeperhub.executeTransfer(req);
    } else {
      execution = {
        mode: keeperhub.mode,
        mock: keeperhub.mode === "MOCK",
        label:
          keeperhub.mode === "MOCK"
            ? "MOCK simulate failed — no broadcast"
            : "LIVE simulate failed — execute_transfer skipped (fail-closed)",
        status: "not_sent",
        error: simulation.error ?? simulation.revertReason ?? "wouldRevert",
      };
    }
  }

  const ledgerEntry = ledger.append({
    decision,
    intent: intent.serialize(),
    execution: execution ?? { status: "not_attempted", reason: decision.state },
    note: `Almanak ${strategy.name} → CHP ${decision.state} → KeeperHub ${execution?.mode ?? "n/a"}`,
  });

  return {
    strategyName: strategy.name,
    intent,
    plan,
    decision,
    simulation,
    execution,
    ledgerEntry,
    skipped: false,
  };
}
