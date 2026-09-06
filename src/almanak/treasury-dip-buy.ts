import { compareDecimal } from "../lib/money.js";
import { Intent, type AlmanakIntent } from "./intents.js";
import type { MarketSnapshot } from "./market.js";
import { IntentStrategy } from "./strategy.js";

/**
 * Sample Almanak-style strategy.
 *
 * Faithful to the SDK getting-started example:
 *   if ETH < $2000 and USDC.balance_usd > threshold → Intent.swap(USDC, ETH)
 *
 * Uses Almanak chain name `"base"` (remapped to Base Sepolia by the adapter
 * when KEEPERHUB_CHAIN_ID is a testnet).
 */
export class TreasuryDipBuyStrategy extends IntentStrategy {
  readonly name = "TreasuryDipBuy";
  readonly ethTriggerUsd: string;
  readonly minUsdcUsd: string;
  readonly clipUsd: string;
  readonly chain: string;
  readonly protocol: string;

  constructor(
    opts: {
      ethTriggerUsd?: string;
      minUsdcUsd?: string;
      clipUsd?: string;
      chain?: string;
      protocol?: string;
    } = {},
  ) {
    super();
    this.ethTriggerUsd = opts.ethTriggerUsd ?? "2000";
    this.minUsdcUsd = opts.minUsdcUsd ?? "500";
    this.clipUsd = opts.clipUsd ?? "25";
    this.chain = opts.chain ?? "base";
    this.protocol = opts.protocol ?? "uniswap_v3";
  }

  decide(market: MarketSnapshot): AlmanakIntent | null {
    const ethPrice = market.price("ETH");
    const usdc = market.balance("USDC");
    const cheap = compareDecimal(ethPrice, this.ethTriggerUsd) < 0;
    const funded = compareDecimal(usdc.balanceUsd, this.minUsdcUsd) > 0;

    if (cheap && funded) {
      return Intent.swap({
        fromToken: "USDC",
        toToken: "ETH",
        amountUsd: this.clipUsd,
        chain: this.chain,
        protocol: this.protocol,
        maxSlippage: "0.005",
        confidence: "0.91",
      });
    }

    return Intent.hold("Waiting for a cheaper ETH print and idle USDC", {
      chain: this.chain,
      confidence: "0.40",
    });
  }
}
