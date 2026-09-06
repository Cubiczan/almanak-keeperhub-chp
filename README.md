# Almanak KeeperGate

**Almanak × KeeperHub via Cubiczan CHP**

A thin MIT wrapper for the [DoraHacks KeeperHub — The Agent Economy Hackathon](https://dorahacks.io/hackathon/agent-economy).

Almanak is the **live project**: a production DeFi strategy / agent platform whose `IntentStrategy.decide()` method emits high-level intents (`Intent.swap`, `Intent.hold`, …). KeeperHub is the **deterministic onchain execution layer**. Cubiczan CHP is the **fail-closed policy gate** between them — not the live-project claim.

```
Almanak decide()  →  CHP gate  →  KeeperHub simulate  →  execute_transfer  →  dual audit
     SwapIntent     EXPLORING →     simulate: true        LOCKED only         HMAC ledger
                    PROVISIONAL →                        + execution id /
                    LOCKED | HITL | BLOCKED              tx hash when live
```

| Piece | Role | Surface |
| --- | --- | --- |
| **Almanak** | Live strategy / agent that produces DeFi intents | [SDK](https://github.com/almanak-co/sdk) · [docs](https://sdk.docs.almanak.co/) · [almanak.co](https://almanak.co) |
| **Cubiczan CHP** | Governance glue: caps, allowlists, HITL, HMAC ledger | This repo (simplified original gate; same state names as [agent-governance](https://github.com/icohangar-ops/agent-governance)) |
| **KeeperHub** | Simulate then execute onchain | [MCP](https://app.keeperhub.com/mcp) · [MCP docs](https://docs.keeperhub.com/ai-tools/mcp-server) · [Direct Execution REST](https://docs.keeperhub.com/api/direct-execution) |

## Judges: under five minutes

```bash
git clone <this-repo> && cd almanak-keeperhub-chp
npm install
npm test
npm run demo          # happy path: Almanak swap → CHP LOCKED → MOCK KeeperHub
npm run demo:blocked  # same strategy, $5,000 clip → CHP BLOCKED (no execute)
```

No API key is required. When `KEEPERHUB_API_KEY` is unset the full Almanak → CHP flow still runs and writes a **clearly labeled MOCK** execution record. The MOCK path **never invents a transaction hash**.

## What the demo prints

1. **Almanak** `TreasuryDipBuy.decide(market)` — same shape as the SDK getting-started strategy: if ETH &lt; $2,000 and idle USDC is above the floor, return `Intent.swap(USDC → ETH, $25, chain="base", protocol="uniswap_v3")`.
2. **Adapter** compiles that intent to a KeeperHub `execute_transfer` plan on **Base Sepolia (`84532`)**. Almanak’s mainnet name `"base"` is remapped to the testnet so a faithful `decide()` can settle without a mainnet wallet.
3. **CHP** walks `EXPLORING → PROVISIONAL → LOCKED` (or `HITL_REQUIRED` / `BLOCKED`) against `policy.example.yaml`.
4. **KeeperHub** `simulate: true` on `POST /api/execute/transfer`. Execute only if the gate is `LOCKED` and the dry-run reports `success: true` and `wouldRevert: false`.
5. **Dual audit**: CHP HMAC append-only ledger + KeeperHub `executionId` / `transactionHash` when live.

## How to land a real DoraHacks transaction

1. Create an organisation API key (`kh_…`) at [app.keeperhub.com](https://app.keeperhub.com) → Settings → Developer → API keys.
2. Copy `.env.example` → `.env` and set `KEEPERHUB_API_KEY`. Do not commit `.env`.
3. Connect a wallet integration in KeeperHub and fund it on **Base Sepolia** (`84532`). Sepolia (`11155111`) also works.
4. Set `KEEPERHUB_RECIPIENT_ADDRESS` to an all-lowercase or valid EIP-55 address (KeeperHub rejects a bad mixed-case checksum).
5. Run `npm run demo` again. The client follows the documented safe first-write sequence:
   - `POST /api/execute/transfer` with `"simulate": true` (boolean, not the string `"true"`)
   - same body without `simulate`, plus `Idempotency-Key` (SHA-256 of `taskId|chainId|recipientAddress|amount|tokenAddress`)
   - poll `GET /api/execute/{executionId}/status` and keep the real `transactionHash` / `transactionLink`

The same key authenticates the HTTP MCP server at `https://app.keeperhub.com/mcp` (`Authorization: Bearer kh_...`). This repo talks to the REST direct-execution API because `execute_transfer` + `simulate` is the documented first-write path; MCP exposes the same tools (`execute_transfer`, `get_direct_execution_status`, `execute_protocol_action`).

CHP still evaluates the **Almanak USD notional** (the $25 swap). The broadcast size defaults to `KEEPERHUB_TRANSFER_AMOUNT=0.001` so the onchain proof stays cheap. Set `KEEPERHUB_USE_INTENT_AMOUNT=true` only if you intend to size the transfer from the snapshot price.

## Plug in a real Almanak deployment

This repo does **not** vendor the Almanak Python SDK. It reimplements the public `IntentStrategy` / `Intent.swap` / `MarketSnapshot` vocabulary in TypeScript so the demo runs offline.

A live Almanak worker plugs in as:

```python
# inside your Almanak strategy container (no secrets here)
intent = self.decide(market)
if intent is not None:
    gateway.post("/chp/propose", Intent.serialize(intent))
```

```ts
import { Intent, runGovernedCycle } from "almanak-keeperhub-chp";

const intent = Intent.deserialize(almanakJson);
// then compile → evaluateGate → KeeperHub
```

The gateway sidecar (Almanak’s recommended architecture) holds the KeeperHub key and the CHP ledger key. Strategy containers stay secretless.

## Policy

See `policy.example.yaml`. Caps:

| Field | Demo value | Effect |
| --- | --- | --- |
| `max_notional_usd` | 100 | Above → `BLOCKED` |
| `hitl_notional_usd` | 50 | At/above (and ≤ max) → `HITL_REQUIRED` |
| `daily_cap_usd` | 250 | Projected spend above → `BLOCKED` |
| `min_confidence` | 0.70 | Below → `BLOCKED` (or HITL if `hitl_on_low_confidence`) |
| `allowed_chains` | 84532, 11155111 | Anything else → `BLOCKED` |
| `allowed_venues` | uniswap_v3, aerodrome, enso, keeperhub_transfer | Anything else → `BLOCKED` |

Unknown chain, missing notional, or missing confidence is **fail-closed** (`BLOCKED`). Only `LOCKED` decisions may call KeeperHub execute.

## Repository map

```
src/almanak/     Intent factory, MarketSnapshot, IntentStrategy, sample strategy, compiler
src/chp/         Policy YAML, gate state machine, HMAC append-only ledger
src/keeperhub/   Mock + live adapters (REST simulate / execute_transfer / status)
src/cli/demo.ts  Judge walkthrough
policy.example.yaml
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | Gate, ledger, adapter, pipeline, money/idempotency tests |
| `npm run demo` | Happy path without secrets |
| `npm run demo:blocked` | Oversize clip → `BLOCKED`, no execute |
| `npm run build` | Emit `dist/` |

## License

MIT © Cubiczan / Shyam Desigan (`sam@cubiczan.com`)

Video script: [DEMO.md](./DEMO.md)
