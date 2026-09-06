/**
 * Minimal MarketSnapshot matching Almanak's `market.price()` / `market.balance()`
 * surface used by `IntentStrategy.decide()`.
 * https://sdk.docs.almanak.co/getting-started.html
 */

export type TokenBalance = {
  symbol: string;
  amount: string;
  balanceUsd: string;
};

export class MarketSnapshot {
  readonly timestamp: Date;
  private readonly prices: Map<string, string>;
  private readonly balances: Map<string, TokenBalance>;

  constructor(input: {
    timestamp?: Date;
    prices: Record<string, string>;
    balances: Record<string, TokenBalance>;
  }) {
    this.timestamp = input.timestamp ?? new Date();
    this.prices = new Map(
      Object.entries(input.prices).map(([k, v]) => [k.toUpperCase(), v]),
    );
    this.balances = new Map(
      Object.entries(input.balances).map(([k, v]) => [k.toUpperCase(), v]),
    );
  }

  price(symbol: string): string {
    const value = this.prices.get(symbol.toUpperCase());
    if (value === undefined) {
      throw new Error(`MarketSnapshot has no price for ${symbol}`);
    }
    return value;
  }

  balance(symbol: string): TokenBalance {
    const value = this.balances.get(symbol.toUpperCase());
    if (value === undefined) {
      throw new Error(`MarketSnapshot has no balance for ${symbol}`);
    }
    return value;
  }
}

/** Fixture used by the demo and tests — ETH below the $2,000 dip-buy trigger. */
export function demoDipMarket(): MarketSnapshot {
  return new MarketSnapshot({
    prices: { ETH: "1842.50", USDC: "1", WETH: "1842.50" },
    balances: {
      USDC: { symbol: "USDC", amount: "1200", balanceUsd: "1200" },
      ETH: { symbol: "ETH", amount: "0.40", balanceUsd: "737" },
    },
  });
}

export function quietMarket(): MarketSnapshot {
  return new MarketSnapshot({
    prices: { ETH: "3120", USDC: "1", WETH: "3120" },
    balances: {
      USDC: { symbol: "USDC", amount: "80", balanceUsd: "80" },
      ETH: { symbol: "ETH", amount: "1.2", balanceUsd: "3744" },
    },
  });
}
