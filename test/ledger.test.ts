import { describe, expect, it } from "vitest";
import { HmacAuditLedger } from "../src/chp/ledger.js";
import type { GateDecision } from "../src/chp/states.js";

function decision(state: GateDecision["state"], notionalUsd = "25"): GateDecision {
  return {
    state,
    trail: ["EXPLORING", "PROVISIONAL", state],
    reasons: [{ code: "test", message: "test" }],
    policyId: "test",
    notionalUsd,
    dailySpentUsd: "0",
    dailyRemainingUsd: "250",
  };
}

describe("HMAC audit ledger", () => {
  it("chains entries and verifies", () => {
    const ledger = new HmacAuditLedger("unit-test-key");
    ledger.append({ decision: decision("LOCKED"), intent: { n: 1 } });
    ledger.append({ decision: decision("BLOCKED", "5000"), intent: { n: 2 } });
    expect(ledger.verify()).toEqual({ ok: true });
    expect(ledger.all()).toHaveLength(2);
    expect(ledger.all()[1]?.prevHash).toBe(ledger.all()[0]?.hmac);
  });

  it("detects payload tampering", () => {
    const ledger = new HmacAuditLedger("unit-test-key");
    ledger.append({ decision: decision("LOCKED"), intent: { n: 1 } });
    const entry = ledger.all()[0]!;
    (entry.payload as { intent: { n: number } }).intent.n = 99;
    const result = ledger.verify();
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("payload hash mismatch");
  });

  it("counts only today's LOCKED notionals toward the daily cap", () => {
    const ledger = new HmacAuditLedger("unit-test-key");
    ledger.append({ decision: decision("LOCKED", "25"), intent: {} });
    ledger.append({ decision: decision("LOCKED", "10"), intent: {} });
    ledger.append({ decision: decision("BLOCKED", "5000"), intent: {} });
    expect(ledger.dailySpentUsd()).toBe("35");
  });
});
