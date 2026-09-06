import type { AlmanakIntent } from "./intents.js";
import type { MarketSnapshot } from "./market.js";

/**
 * Mirrors Almanak `IntentStrategy.decide(market) -> Intent | None`.
 * A live Almanak deployment can skip this class and POST a serialized
 * `decide()` result into `Intent.deserialize`.
 */
export abstract class IntentStrategy {
  abstract readonly name: string;

  abstract decide(market: MarketSnapshot): AlmanakIntent | null;
}
