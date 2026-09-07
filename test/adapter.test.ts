import { describe, expect, it } from "vitest";
import { compileAlmanakIntent } from "../src/almanak/adapter.js";
import { Intent } from "../src/almanak/intents.js";
import { demoDipMarket } from "../src/almanak/market.js";
import { TreasuryDipBuyStrategy } from "../src/almanak/treasury-dip-buy.js";
import { quietMarket } from "../src/almanak/market.js";
import { loadConfig } from "../src/lib/config.js";

describe("Almanak adapter", () => {
  it("round-trips Intent.swap serialize/deserialize", () => {
    const original = Intent.swap({
      fromToken: "USDC",
      toToken: "ETH",
      amountUsd: "25",
      chain: "base",
      protocol: "uniswap_v3",
      confidence: "0.91",
    });
    const again = Intent.deserialize(original.serialize());
    expect(again.intentType).toBe("swap");
    if (again.intentType === "swap") {
      expect(again.fromToken).toBe("USDC");
      expect(again.amountUsd).toBe("25");
      expect(again.protocol).toBe("uniswap_v3");
    }
  });

  it("TreasuryDipBuy emits a swap on the dip fixture and hold when quiet", () => {
    const strategy = new TreasuryDipBuyStrategy();
    const buy = strategy.decide(demoDipMarket());
    expect(buy?.intentType).toBe("swap");
    const hold = strategy.decide(quietMarket());
    expect(hold?.intentType).toBe("hold");
  });

  it("remaps Almanak chain=base to Base Sepolia when the env prefers 84532", () => {
    const plan = compileAlmanakIntent({
      intent: Intent.swap({
        fromToken: "USDC",
        toToken: "ETH",
        amountUsd: "25",
        chain: "base",
        protocol: "uniswap_v3",
        confidence: "0.91",
      }),
      market: demoDipMarket(),
      config: loadConfig({ chainId: 84532, tokenAddress: undefined, transferAmount: "0.001" }),
      strategyName: "TreasuryDipBuy",
    });
    expect(plan.chainId).toBe(84532);
    expect(plan.notionalUsd).toBe("25");
    expect(plan.keeperHub?.tool).toBe("execute_transfer");
    expect(plan.keeperHub?.amount).toBe("0.001");
  });


  it("keeps Almanak chain=base on Base mainnet when the env prefers 8453", () => {
    const plan = compileAlmanakIntent({
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
      strategyName: "TreasuryDipBuy",
    });
    expect(plan.chainId).toBe(8453);
    expect(plan.keeperHub?.tokenAddress).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
    expect(plan.keeperHub?.amount).toBe("0.01");
    expect(plan.notes.some((n) => n.includes("Base mainnet (8453)"))).toBe(true);
  });

  it("omits tokenAddress when unset so execute_transfer stays native", () => {
    const plan = compileAlmanakIntent({
      intent: Intent.swap({
        fromToken: "USDC",
        toToken: "ETH",
        amountUsd: "25",
        chain: "base",
        protocol: "uniswap_v3",
        confidence: "0.91",
      }),
      market: demoDipMarket(),
      config: loadConfig({ chainId: 84532, tokenAddress: undefined, transferAmount: "0.001" }),
      strategyName: "TreasuryDipBuy",
    });
    expect(plan.keeperHub?.tokenAddress).toBeUndefined();
  });

  it("compiles hold without a KeeperHub payload", () => {
    const plan = compileAlmanakIntent({
      intent: Intent.hold("Waiting"),
      market: demoDipMarket(),
      config: loadConfig({ tokenAddress: undefined }),
      strategyName: "TreasuryDipBuy",
    });
    expect(plan.kind).toBe("hold");
    expect(plan.keeperHub).toBeUndefined();
  });
});
