import { describe, expect, it } from "vitest";
import { compileAlmanakIntent } from "../src/almanak/adapter.js";
import { Intent } from "../src/almanak/intents.js";
import { demoDipMarket } from "../src/almanak/market.js";
import { evaluateGate } from "../src/chp/gate.js";
import { parsePolicy, type Policy } from "../src/chp/policy.js";
import { loadConfig } from "../src/lib/config.js";

function policy(overrides: Record<string, unknown> = {}): Policy {
  return parsePolicy({
    policy_id: "test",
    version: 1,
    max_notional_usd: "100",
    hitl_notional_usd: "50",
    daily_cap_usd: "250",
    min_confidence: "0.70",
    allowed_chains: [84532, 11155111, "base-sepolia", "sepolia"],
    allowed_venues: ["uniswap_v3", "keeperhub_transfer"],
    allowed_tokens: ["ETH", "USDC", "WETH"],
    ...overrides,
  });
}

function plan(intent = Intent.swap({
  fromToken: "USDC",
  toToken: "ETH",
  amountUsd: "25",
  chain: "base",
  protocol: "uniswap_v3",
  confidence: "0.91",
})) {
  return compileAlmanakIntent({
    intent,
    market: demoDipMarket(),
    config: loadConfig({ chainId: 84532, keeperhubApiKey: undefined, tokenAddress: undefined, transferAmount: "0.001" }),
    strategyName: "test",
  });
}

describe("CHP gate", () => {
  it("LOCKS a compliant Almanak swap on Base Sepolia", () => {
    const decision = evaluateGate({ plan: plan(), policy: policy(), dailySpentUsd: "0" });
    expect(decision.trail).toEqual(["EXPLORING", "PROVISIONAL", "LOCKED"]);
    expect(decision.state).toBe("LOCKED");
    expect(decision.notionalUsd).toBe("25");
  });

  it("BLOCKS oversize notional", () => {
    const decision = evaluateGate({
      plan: plan(
        Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "5000",
          chain: "base",
          protocol: "uniswap_v3",
          confidence: "0.99",
        }),
      ),
      policy: policy(),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.reasons.some((r) => r.code === "max_notional")).toBe(true);
  });

  it("BLOCKS a chain that is not allowlisted", () => {
    const decision = evaluateGate({
      plan: plan(
        Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "25",
          chain: "arbitrum",
          protocol: "uniswap_v3",
          confidence: "0.91",
        }),
      ),
      policy: policy(),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.reasons.some((r) => r.code === "chain_not_allowlisted")).toBe(true);
  });

  it("BLOCKS an unknown venue", () => {
    const decision = evaluateGate({
      plan: plan(
        Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "25",
          chain: "base",
          protocol: "mystery_dex",
          confidence: "0.91",
        }),
      ),
      policy: policy(),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.reasons.some((r) => r.code === "venue_not_allowlisted")).toBe(true);
  });

  it("requires HITL at the notional threshold", () => {
    const decision = evaluateGate({
      plan: plan(
        Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "50",
          chain: "base",
          protocol: "uniswap_v3",
          confidence: "0.91",
        }),
      ),
      policy: policy(),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("HITL_REQUIRED");
    expect(decision.reasons.some((r) => r.code === "hitl_threshold")).toBe(true);
  });

  it("BLOCKS when daily cap would be exceeded", () => {
    const decision = evaluateGate({
      plan: plan(),
      policy: policy(),
      dailySpentUsd: "240",
    });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.reasons.some((r) => r.code === "daily_cap")).toBe(true);
  });

  it("BLOCKS below min confidence (fail-closed)", () => {
    const decision = evaluateGate({
      plan: plan(
        Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "25",
          chain: "base",
          protocol: "uniswap_v3",
          confidence: "0.20",
        }),
      ),
      policy: policy(),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.reasons.some((r) => r.code === "min_confidence")).toBe(true);
  });

  it("can route low confidence to HITL when policy asks", () => {
    const decision = evaluateGate({
      plan: plan(
        Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "25",
          chain: "base",
          protocol: "uniswap_v3",
          confidence: "0.20",
        }),
      ),
      policy: policy({ hitl_on_low_confidence: true }),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("HITL_REQUIRED");
  });

  it("BLOCKS a missing confidence score", () => {
    const decision = evaluateGate({
      plan: plan(
        Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "25",
          chain: "base",
          protocol: "uniswap_v3",
        }),
      ),
      policy: policy(),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("BLOCKED");
    expect(decision.reasons.some((r) => r.code === "missing_confidence")).toBe(true);
  });


  it("LOCKS a Base mainnet (8453) plan when policy allowlists base", () => {
    const decision = evaluateGate({
      plan: compileAlmanakIntent({
        intent: Intent.swap({
          fromToken: "USDC",
          toToken: "ETH",
          amountUsd: "25",
          chain: "base",
          protocol: "uniswap_v3",
          confidence: "0.91",
        }),
        market: demoDipMarket(),
        config: loadConfig({
          chainId: 8453,
          tokenAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          transferAmount: "0.01",
        }),
        strategyName: "test",
      }),
      policy: policy({ allowed_chains: [8453, 84532, "base"] }),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("LOCKED");
  });

  it("does not LOCK a hold intent", () => {
    const decision = evaluateGate({
      plan: plan(Intent.hold("Waiting")),
      policy: policy(),
      dailySpentUsd: "0",
    });
    expect(decision.state).toBe("EXPLORING");
    expect(decision.reasons.some((r) => r.code === "hold")).toBe(true);
  });
});
