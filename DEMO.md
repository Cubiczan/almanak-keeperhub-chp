# DEMO.md — ≤3 minute video script

Film `npm run demo` then `npm run demo:blocked`. No API key required.

---

**[0:00–0:20] Title / claim**

> “This is Almanak KeeperGate. Almanak is the live DeFi strategy platform. Its `decide()` method emits an intent. Cubiczan CHP is a fail-closed policy gate. KeeperHub is the deterministic execution layer. The path is Almanak → CHP → KeeperHub.”

Show the README diagram or the terminal banner.

**[0:20–0:50] Almanak intent**

Run:

```bash
npm run demo
```

Pause on section 1–2.

> “The sample strategy is the Almanak getting-started shape: if ETH is under two thousand dollars and we have idle USDC, `decide()` returns `Intent.swap` from USDC to ETH, twenty-five dollars notional, protocol `uniswap_v3`, chain `base`. The adapter remaps `base` to Base Sepolia, chain id 84532, and compiles a KeeperHub `execute_transfer` settlement.”

Point at the printed JSON (`intent_type: swap`).

**[0:50–1:20] CHP gate**

Pause on section 3.

> “CHP walks EXPLORING, then PROVISIONAL, then LOCKED. Policy caps: max notional one hundred dollars, daily cap two hundred fifty, min confidence 0.70, testnet allowlist only. This clip is twenty-five dollars at 0.91 confidence on an allowlisted venue, so it locks.”

**[1:20–1:50] KeeperHub simulate + MOCK execute**

Pause on sections 4–5.

> “Because there is no `KEEPERHUB_API_KEY`, KeeperHub runs in MOCK mode. We still call the same simulate-then-execute sequence. The MOCK receipt is labeled MOCK. There is no fake transaction hash — we refuse to invent one. With a real `kh_` key this is `POST /api/execute/transfer` with `simulate: true`, then the same body plus an Idempotency-Key.”

**[1:50–2:20] Dual audit**

Pause on section 6.

> “Two audits: the CHP HMAC append-only ledger — sequence, previous hash, HMAC, verified ok — and the KeeperHub execution id. On a live run the ledger also stores the real tx hash from `get_direct_execution_status`.”

**[2:20–2:50] Blocked path**

```bash
npm run demo:blocked
```

> “Same Almanak strategy, five-thousand-dollar clip. CHP hits `max_notional` and ends BLOCKED. Simulate and execute never run. Fail-closed.”

**[2:50–3:00] Close**

> “To submit a real DoraHacks transaction: set `KEEPERHUB_API_KEY`, fund a wallet on Base Sepolia, rerun `npm run demo`, and paste the KeeperHub tx link. Almanak intent, CHP lock, KeeperHub execution.”
