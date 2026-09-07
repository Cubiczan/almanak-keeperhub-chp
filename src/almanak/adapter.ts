import { chainLabel, resolveChainId } from "../lib/chains.js";
import { canonicalizeAmount, compareDecimal, divDecimal, mulDecimal } from "../lib/money.js";
import type { AppConfig } from "../lib/config.js";
import type { AlmanakIntent, HoldIntent, SwapIntent } from "./intents.js";
import type { MarketSnapshot } from "./market.js";

export type KeeperHubTool = "execute_transfer" | "execute_protocol_action";

export type ExecutionPlan = {
  kind: "execute" | "hold";
  source: "almanak";
  strategyName: string;
  intent: AlmanakIntent;
  notionalUsd?: string;
  chainId?: number;
  chainLabel?: string;
  venue?: string;
  tokens: string[];
  confidence?: string;
  keeperHub?: {
    tool: KeeperHubTool;
    chainId: number;
    recipientAddress: string;
    amount: string;
    tokenAddress?: string;
    protocolAction?: string;
    memo: string;
  };
  notes: string[];
};

/**
 * Compiles an Almanak intent into a KeeperHub direct-execution plan.
 *
 * A live Almanak `IntentCompiler` would emit an ActionBundle (to/data/value).
 * This adapter is the thin plug-in surface: swap/supply → KeeperHub
 * `execute_transfer` (testnet settlement) or `execute_protocol_action`.
 *
 * CHP evaluates the Almanak USD notional. The on-chain amount defaults to
 * `KEEPERHUB_TRANSFER_AMOUNT` so judges can film a cheap Base Sepolia proof.
 */
export function compileAlmanakIntent(input: {
  intent: AlmanakIntent;
  market: MarketSnapshot;
  config: AppConfig;
  strategyName: string;
}): ExecutionPlan {
  const { intent, market, config, strategyName } = input;
  if (intent.intentType === "hold") {
    return holdPlan(intent, strategyName);
  }

  const chainId = resolveChainId(intent.chain, config.chainId);
  const notionalUsd = resolveNotionalUsd(intent, market);
  const venue = intent.protocol ?? "keeperhub_transfer";
  const tokens = tokensOf(intent);
  const notes: string[] = [];

  if (chainId !== undefined && intent.chain && String(intent.chain).toLowerCase() === "base") {
    if (chainId === 84532) {
      notes.push('Almanak chain "base" remapped to Base Sepolia (84532) for testnet settlement.');
    } else if (chainId === 8453) {
      notes.push('Almanak chain "base" resolved to Base mainnet (8453).');
    }
  }

  const tokenAddress = config.tokenAddress;
  const assetLabel = tokenAddress ? `TOKEN ${tokenAddress}` : "native";

  const transferAmount =
    config.useIntentAmount && notionalUsd
      ? tokenAddress
        ? canonicalizeAmount(notionalUsd)
        : nativeFromUsd(notionalUsd, market)
      : canonicalizeAmount(config.transferAmount);

  if (!config.useIntentAmount) {
    notes.push(
      `KeeperHub broadcast size is ${transferAmount} (${assetLabel}), not the Almanak USD notional.`,
    );
  } else if (tokenAddress) {
    notes.push("KEEPERHUB_USE_INTENT_AMOUNT: ERC-20 amount uses Almanak notional (USDC ≈ $1).");
  }

  const tool: KeeperHubTool =
    intent.intentType === "swap" && venue !== "keeperhub_transfer"
      ? "execute_protocol_action"
      : "execute_transfer";

  // Protocol actions still need a funded DEX path; the demo always also
  // carries a transfer payload so simulate/execute_transfer works offline
  // and on a fresh KeeperHub org wallet.
  notes.push(
    tool === "execute_protocol_action"
      ? `Would call KeeperHub execute_protocol_action (${venue}/swap). Demo settlement uses execute_transfer.`
      : "Compiled to KeeperHub execute_transfer (native/ERC-20).",
  );

  return {
    kind: "execute",
    source: "almanak",
    strategyName,
    intent,
    notionalUsd,
    chainId,
    chainLabel: chainId !== undefined ? chainLabel(chainId) : undefined,
    venue,
    tokens,
    confidence: intent.confidence,
    keeperHub: chainId === undefined
      ? undefined
      : {
          tool: "execute_transfer",
          chainId,
          recipientAddress: config.recipientAddress,
          amount: transferAmount,
          tokenAddress,
          memo: `almanak:${intent.intentType}:${intent.intentId}`,
        },
    notes,
  };
}

function holdPlan(intent: HoldIntent, strategyName: string): ExecutionPlan {
  return {
    kind: "hold",
    source: "almanak",
    strategyName,
    intent,
    tokens: [],
    confidence: intent.confidence,
    notes: [intent.reason],
  };
}

function resolveNotionalUsd(intent: AlmanakIntent, market: MarketSnapshot): string | undefined {
  if (intent.intentType === "hold") return undefined;
  if ("amountUsd" in intent && intent.amountUsd) {
    return canonicalizeAmount(intent.amountUsd);
  }
  if ("amount" in intent && intent.amount) {
    const symbol =
      intent.intentType === "swap" ? (intent as SwapIntent).fromToken : intent.token;
    try {
      return mulDecimal(intent.amount, market.price(symbol));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function tokensOf(intent: AlmanakIntent): string[] {
  if (intent.intentType === "swap") return [intent.fromToken, intent.toToken];
  if (intent.intentType === "supply" || intent.intentType === "withdraw") return [intent.token];
  return [];
}

function nativeFromUsd(notionalUsd: string, market: MarketSnapshot): string {
  const eth = market.price("ETH");
  const raw = divDecimal(notionalUsd, eth, 6);
  if (compareDecimal(raw, "0") === 0) return "0.001";
  return raw;
}
