import { describe, expect, it } from "vitest";
import { addDecimal, canonicalizeAmount, compareDecimal, mulDecimal, subDecimal } from "../src/lib/money.js";
import { keeperHubIdempotencyKey } from "../src/keeperhub/idempotency.js";

describe("decimal helpers", () => {
  it("canonicalizes amounts the way KeeperHub documents", () => {
    expect(canonicalizeAmount("0.0010")).toBe("0.001");
    expect(canonicalizeAmount("01.5")).toBe("1.5");
    expect(canonicalizeAmount("1.000")).toBe("1");
  });

  it("adds, subtracts, and compares without floats", () => {
    expect(addDecimal("240", "25")).toBe("265");
    expect(subDecimal("250", "25")).toBe("225");
    expect(compareDecimal("25", "100")).toBe(-1);
    expect(mulDecimal("0.4", "1842.50")).toBe("737");
  });
});

describe("KeeperHub idempotency key", () => {
  it("is stable for the same work", () => {
    const a = keeperHubIdempotencyKey({
      taskId: "intent-1|2026-09-06",
      chainId: 84532,
      recipientAddress: "0x000000000000000000000000000000000000dEaD",
      amount: "0.0010",
    });
    const b = keeperHubIdempotencyKey({
      taskId: "intent-1|2026-09-06",
      chainId: 84532,
      recipientAddress: "0x000000000000000000000000000000000000dead",
      amount: "0.001",
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
