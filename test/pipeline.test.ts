import { describe, expect, it } from "vitest";
import { compileAlmanakIntent } from "../src/almanak/adapter.js";
import { demoDipMarket } from "../src/almanak/market.js";
import { TreasuryDipBuyStrategy } from "../src/almanak/treasury-dip-buy.js";
import { HmacAuditLedger } from "../src/chp/ledger.js";
import { parsePolicy } from "../src/chp/policy.js";
import { MockKeeperHub } from "../src/keeperhub/mock.js";
import { loadConfig } from "../src/lib/config.js";
import { runGovernedCycle } from "../src/pipeline.js";

const policy = parsePolicy({
  policy_id: "test",
  version: 1,
  max_notional_usd: "100",
  hitl_notional_usd: "50",
  daily_cap_usd: "250",
  min_confidence: "0.70",
  allowed_chains: [84532, "base-sepolia"],
  allowed_venues: ["uniswap_v3"],
  allowed_tokens: ["ETH", "USDC"],
});

describe("governed pipeline", () => {
  it("LOCKS then MOCK-executes without inventing a tx hash", async () => {
    const result = await runGovernedCycle({
      strategy: new TreasuryDipBuyStrategy(),
      market: demoDipMarket(),
      policy,
      config: loadConfig({ keeperhubApiKey: undefined, chainId: 84532 }),
      ledger: new HmacAuditLedger("test-key"),
      keeperhub: new MockKeeperHub(),
    });
    expect(result.decision?.state).toBe("LOCKED");
    expect(result.simulation?.mode).toBe("MOCK");
    expect(result.simulation?.success).toBe(true);
    expect(result.execution?.mock).toBe(true);
    expect(result.execution?.transactionHash).toBeUndefined();
    expect(result.execution?.label).toMatch(/MOCK/);
    expect(result.ledgerEntry?.hmac).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not call execute when policy BLOCKS", async () => {
    const result = await runGovernedCycle({
      strategy: new TreasuryDipBuyStrategy({ clipUsd: "5000" }),
      market: demoDipMarket(),
      policy,
      config: loadConfig({ keeperhubApiKey: undefined, chainId: 84532 }),
      ledger: new HmacAuditLedger("test-key"),
      keeperhub: new MockKeeperHub(),
    });
    expect(result.decision?.state).toBe("BLOCKED");
    expect(result.simulation).toBeUndefined();
    expect(result.execution).toBeUndefined();
    expect(result.ledgerEntry?.payload.decision.state).toBe("BLOCKED");
  });

  it("exposes a compiled transfer plan judges can map to KeeperHub REST", () => {
    const strategy = new TreasuryDipBuyStrategy();
    const intent = strategy.decide(demoDipMarket())!;
    const compiled = compileAlmanakIntent({
      intent,
      market: demoDipMarket(),
      config: loadConfig({ chainId: 84532 }),
      strategyName: strategy.name,
    });
    expect(compiled.keeperHub?.chainId).toBe(84532);
    expect(compiled.keeperHub?.recipientAddress).toMatch(/^0x[a-f0-9]{40}$/);
  });
});
