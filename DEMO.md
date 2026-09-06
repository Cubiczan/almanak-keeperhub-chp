# DEMO.md — ≤3 minute DoraHacks video script

Same story as the README: **Almanak intent → CHP gate → KeeperHub simulate/execute → dual audit.**

Film `npm run demo`, then `npm run demo:blocked`. No API key. If you later film a LIVE run, say “LIVE” and show the real KeeperHub tx link — never a made-up hash.

---

**[0:00–0:20] Title**

> “Almanak KeeperGate, for the KeeperHub Agent Economy hackathon, main track Best Integration into a Live Project. Almanak is the live DeFi strategy platform. Cubiczan CHP is a fail-closed policy gate. KeeperHub is the only path that may move value.”

Show the README mermaid or the terminal banner: `Almanak intent → Cubiczan CHP → KeeperHub execution`.

**[0:20–0:50] Almanak decide()**

```bash
npm run demo
```

Pause on sections 1–2. Point at `intent_type: swap`.

> “This is Almanak’s published `IntentStrategy.decide()` shape. ETH is $1,842, under two thousand, and we have idle USDC, so `decide()` returns `Intent.swap` USDC to ETH, twenty-five dollars, protocol `uniswap_v3`, chain `base`. The adapter remaps `base` to Base Sepolia, 84532, and compiles a KeeperHub `execute_transfer` settlement. CHP still scores the twenty-five dollar Almanak notional.”

**[0:50–1:20] CHP gate**

Pause on section 3. Highlight the trail `EXPLORING → PROVISIONAL → LOCKED`.

> “CHP is fail-closed. Policy: max notional one hundred, HITL at fifty, daily cap two hundred fifty, min confidence 0.70, testnets and allowlisted venues only. This clip is twenty-five dollars at 0.91 on `uniswap_v3`, so it locks. Missing confidence, unknown chain, or oversize notional would block.”

**[1:20–1:50] KeeperHub simulate + MOCK execute**

Pause on sections 4–5. Highlight the MOCK label and the missing tx hash.

> “No `KEEPERHUB_API_KEY`, so KeeperHub is MOCK. We still run the documented sequence: simulate first, then execute only because the gate is LOCKED and `wouldRevert` is false. The receipt is labeled MOCK. We do not invent a transaction hash. With a real `kh_` key this is `POST /api/execute/transfer` with boolean `simulate: true`, then the same body plus an Idempotency-Key, then status poll.”

**[1:50–2:20] Dual audit**

Pause on section 6. Point at HMAC verify `ok` and the MOCK execution id.

> “Two audits. CHP HMAC ledger: sequence, previous hash, HMAC, verified. KeeperHub: execution id. On a live run the ledger also stores the real tx hash from `GET /api/execute/{id}/status`. That hash is what we paste into DoraHacks — only if it came from KeeperHub.”

**[2:20–2:50] Blocked path**

```bash
npm run demo:blocked
```

Pause on `BLOCKED` and “Skipped — gate did not LOCK.”

> “Same Almanak strategy, five-thousand-dollar clip. CHP hits `max_notional` and ends BLOCKED. Simulate and execute never run. That is the product: Almanak may decide; KeeperHub may not fire.”

**[2:50–3:00] Close / checklist**

> “Public MIT repo, this recording, and — when we have a key — a Base Sepolia KeeperHub tx link. Almanak decides. CHP gates. KeeperHub executes.”

---

## Live take (optional second clip)

Only if `KEEPERHUB_API_KEY` is set and the org wallet is funded on Base Sepolia:

1. `cp .env.example .env` and fill `KEEPERHUB_API_KEY`, `KEEPERHUB_RECIPIENT_ADDRESS`.
2. `npm run demo` — confirm `KeeperHub LIVE`, then a real `transactionHash` / `transactionLink`.
3. End on the explorer page. Say “this hash is from KeeperHub, not MOCK.”
