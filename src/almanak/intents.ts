import { randomUUID } from "node:crypto";

/**
 * Faithful TypeScript adapter of Almanak's intent vocabulary.
 * Shape follows https://sdk.docs.almanak.co/api/intents.html
 * (`Intent.swap`, `Intent.hold`, `Intent.supply`, …) so a live
 * Almanak `decide()` result can be deserialized without rewriting the strategy.
 */

export type IntentType = "swap" | "hold" | "supply" | "withdraw";

export type SerializedIntent = {
  intent_type: IntentType;
  intent_id: string;
  created_at: string;
  chain?: string | null;
  protocol?: string | null;
  reason?: string | null;
  from_token?: string | null;
  to_token?: string | null;
  token?: string | null;
  amount_usd?: string | null;
  amount?: string | null;
  max_slippage?: string | null;
  destination_chain?: string | null;
  confidence?: string | null;
};

export type AlmanakIntent = SwapIntent | HoldIntent | SupplyIntent | WithdrawIntent;

type BaseFields = {
  intentId: string;
  createdAt: string;
  chain?: string;
  protocol?: string;
  confidence?: string;
};

export class SwapIntent {
  readonly intentType = "swap" as const;
  readonly fromToken: string;
  readonly toToken: string;
  readonly amountUsd?: string;
  readonly amount?: string;
  readonly maxSlippage: string;
  readonly destinationChain?: string;
  readonly intentId: string;
  readonly createdAt: string;
  readonly chain?: string;
  readonly protocol?: string;
  readonly confidence?: string;

  constructor(input: {
    fromToken: string;
    toToken: string;
    amountUsd?: string;
    amount?: string;
    maxSlippage?: string;
    destinationChain?: string;
  } & BaseFields) {
    if (!input.amountUsd && !input.amount) {
      throw new Error("SwapIntent requires amount_usd or amount");
    }
    this.fromToken = input.fromToken;
    this.toToken = input.toToken;
    this.amountUsd = input.amountUsd;
    this.amount = input.amount;
    this.maxSlippage = input.maxSlippage ?? "0.005";
    this.destinationChain = input.destinationChain;
    this.intentId = input.intentId;
    this.createdAt = input.createdAt;
    this.chain = input.chain;
    this.protocol = input.protocol;
    this.confidence = input.confidence;
  }

  serialize(): SerializedIntent {
    return {
      intent_type: "swap",
      intent_id: this.intentId,
      created_at: this.createdAt,
      from_token: this.fromToken,
      to_token: this.toToken,
      amount_usd: this.amountUsd ?? null,
      amount: this.amount ?? null,
      max_slippage: this.maxSlippage,
      protocol: this.protocol ?? null,
      chain: this.chain ?? null,
      destination_chain: this.destinationChain ?? null,
      confidence: this.confidence ?? null,
    };
  }
}

export class HoldIntent {
  readonly intentType = "hold" as const;
  readonly reason: string;
  readonly intentId: string;
  readonly createdAt: string;
  readonly chain?: string;
  readonly protocol?: string;
  readonly confidence?: string;

  constructor(input: { reason: string } & BaseFields) {
    this.reason = input.reason;
    this.intentId = input.intentId;
    this.createdAt = input.createdAt;
    this.chain = input.chain;
    this.protocol = input.protocol;
    this.confidence = input.confidence;
  }

  serialize(): SerializedIntent {
    return {
      intent_type: "hold",
      intent_id: this.intentId,
      created_at: this.createdAt,
      reason: this.reason,
      chain: this.chain ?? null,
      confidence: this.confidence ?? null,
    };
  }
}

export class SupplyIntent {
  readonly intentType = "supply" as const;
  readonly token: string;
  readonly amountUsd?: string;
  readonly amount?: string;
  readonly intentId: string;
  readonly createdAt: string;
  readonly chain?: string;
  readonly protocol?: string;
  readonly confidence?: string;

  constructor(
    input: { token: string; amountUsd?: string; amount?: string } & BaseFields,
  ) {
    this.token = input.token;
    this.amountUsd = input.amountUsd;
    this.amount = input.amount;
    this.intentId = input.intentId;
    this.createdAt = input.createdAt;
    this.chain = input.chain;
    this.protocol = input.protocol;
    this.confidence = input.confidence;
  }

  serialize(): SerializedIntent {
    return {
      intent_type: "supply",
      intent_id: this.intentId,
      created_at: this.createdAt,
      token: this.token,
      amount_usd: this.amountUsd ?? null,
      amount: this.amount ?? null,
      protocol: this.protocol ?? null,
      chain: this.chain ?? null,
      confidence: this.confidence ?? null,
    };
  }
}

export class WithdrawIntent {
  readonly intentType = "withdraw" as const;
  readonly token: string;
  readonly amountUsd?: string;
  readonly amount?: string;
  readonly intentId: string;
  readonly createdAt: string;
  readonly chain?: string;
  readonly protocol?: string;
  readonly confidence?: string;

  constructor(
    input: { token: string; amountUsd?: string; amount?: string } & BaseFields,
  ) {
    this.token = input.token;
    this.amountUsd = input.amountUsd;
    this.amount = input.amount;
    this.intentId = input.intentId;
    this.createdAt = input.createdAt;
    this.chain = input.chain;
    this.protocol = input.protocol;
    this.confidence = input.confidence;
  }

  serialize(): SerializedIntent {
    return {
      intent_type: "withdraw",
      intent_id: this.intentId,
      created_at: this.createdAt,
      token: this.token,
      amount_usd: this.amountUsd ?? null,
      amount: this.amount ?? null,
      protocol: this.protocol ?? null,
      chain: this.chain ?? null,
      confidence: this.confidence ?? null,
    };
  }
}

function stamp(partial?: { intentId?: string; createdAt?: string; confidence?: string }): {
  intentId: string;
  createdAt: string;
  confidence?: string;
} {
  return {
    intentId: partial?.intentId ?? randomUUID(),
    createdAt: partial?.createdAt ?? new Date().toISOString(),
    confidence: partial?.confidence,
  };
}

/** Almanak-style factory: `Intent.swap(...)`, `Intent.hold(...)`. */
export const Intent = {
  swap(input: {
    fromToken: string;
    toToken: string;
    amountUsd?: string;
    amount?: string;
    maxSlippage?: string;
    protocol?: string;
    chain?: string;
    destinationChain?: string;
    confidence?: string;
    intentId?: string;
    createdAt?: string;
  }): SwapIntent {
    return new SwapIntent({ ...stamp(input), ...input });
  },

  hold(reason: string, extra: { chain?: string; confidence?: string } = {}): HoldIntent {
    return new HoldIntent({ ...stamp(extra), reason, ...extra });
  },

  supply(input: {
    token: string;
    amountUsd?: string;
    amount?: string;
    protocol?: string;
    chain?: string;
    confidence?: string;
  }): SupplyIntent {
    return new SupplyIntent({ ...stamp(input), ...input });
  },

  withdraw(input: {
    token: string;
    amountUsd?: string;
    amount?: string;
    protocol?: string;
    chain?: string;
    confidence?: string;
  }): WithdrawIntent {
    return new WithdrawIntent({ ...stamp(input), ...input });
  },

  deserialize(data: SerializedIntent): AlmanakIntent {
    const base = {
      intentId: data.intent_id,
      createdAt: data.created_at,
      chain: data.chain ?? undefined,
      protocol: data.protocol ?? undefined,
      confidence: data.confidence ?? undefined,
    };
    switch (data.intent_type) {
      case "swap":
        return new SwapIntent({
          ...base,
          fromToken: data.from_token ?? "",
          toToken: data.to_token ?? "",
          amountUsd: data.amount_usd ?? undefined,
          amount: data.amount ?? undefined,
          maxSlippage: data.max_slippage ?? undefined,
          destinationChain: data.destination_chain ?? undefined,
        });
      case "hold":
        return new HoldIntent({ ...base, reason: data.reason ?? "hold" });
      case "supply":
        return new SupplyIntent({
          ...base,
          token: data.token ?? "",
          amountUsd: data.amount_usd ?? undefined,
          amount: data.amount ?? undefined,
        });
      case "withdraw":
        return new WithdrawIntent({
          ...base,
          token: data.token ?? "",
          amountUsd: data.amount_usd ?? undefined,
          amount: data.amount ?? undefined,
        });
      default: {
        const neverType: never = data.intent_type;
        throw new Error(`unknown Almanak intent_type: ${String(neverType)}`);
      }
    }
  },
};
