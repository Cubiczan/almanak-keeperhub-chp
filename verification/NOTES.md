# CHP gate + HMAC ledger — Lean verification notes

Model: `verification/Chp.lean` (Lean 4.34.1, core library only).
Compile: `~/.elan/bin/lean Chp.lean` → exit 0. No `sorry`/`admit`/custom
axioms; `#print axioms` on the headline theorems shows at most `propext`
(several are axiom-free). No `src/` files were modified — only this
`verification/` directory was added.

## How the code maps to the model

The "state machine" in this repo is not a persistent machine:
`evaluateGate` (`src/chp/gate.ts`) is a single-pass decision function.
Every evaluation starts at `EXPLORING`, optionally advances to
`PROVISIONAL`, and finishes in one terminal decision. The `trail` field
of `GateDecision` narrates exactly that path, so the model has three
layers:

1. `outcome` / `outcomeBody` — the decision function itself, with the
   plan + policy abstracted into the boolean outcome of each check the
   code performs, **in the code's order** (decimal comparisons via
   `lib/money.compareDecimal` become booleans; string amounts are
   abstracted away).
2. `Step` / `Reach` / `Chain` — the transition relation the trails
   induce, and what it does and does not allow.
3. `Entry` / `Linked` / `appendEntry` — the HMAC ledger with hashes and
   the MAC computation abstracted (SHA-256/HMAC internals are irrelevant
   to the linkage properties; the timestamp, which the code mixes into
   the MAC input at `ledger.ts` ll. 43–45, is likewise abstracted away).

## Theorem → source mapping

### Gate decision function

| Theorem | Claim | Source |
|---|---|---|
| `outcome_hold` | A hold intent decides `EXPLORING` | gate.ts ll. 21–24 |
| `outcomeBody_blocked_missing_notional` | No USD notional → BLOCKED | gate.ts ll. 28–31 |
| `outcomeBody_blocked_unknown_chain` | Unresolvable chain id → BLOCKED | gate.ts ll. 33–39 |
| `outcomeBody_blocked_chain_not_allowed` | Chain not allowlisted → BLOCKED | gate.ts l. 41; policy.ts ll. 66–71 (`chainAllowed`) |
| `outcomeBody_blocked_missing_venue` | No venue → BLOCKED | gate.ts ll. 49–52 |
| `outcomeBody_blocked_venue_not_allowed` | Venue not allowlisted → BLOCKED | gate.ts ll. 54–60 |
| `outcomeBody_blocked_token_not_allowed` | A token outside the allowlist → BLOCKED (modelled as the post-loop outcome `tokensOk`; see finding 2 for the empty-allowlist escape) | gate.ts ll. 62–72 |
| `outcomeBody_blocked_over_max_notional` | Notional > `max_notional_usd` → BLOCKED (strict `>`) | gate.ts ll. 74–80 |
| `outcomeBody_blocked_over_daily_cap` | spent + notional > `daily_cap_usd` → BLOCKED (strict `>`) | gate.ts ll. 82–90 |
| `outcomeBody_blocked_missing_confidence` | No confidence score → BLOCKED | gate.ts ll. 92–98 |
| `outcomeBody_low_confidence` | Confidence < min → `if hitlOnLowConf then HITL_REQUIRED else BLOCKED` | gate.ts ll. 100–107 |
| `outcomeBody_low_conf_hitl` / `outcomeBody_low_conf_blocked` | The two instantiations of the fork | gate.ts ll. 100–107 |
| `outcomeBody_hitl_threshold` | Notional ≥ `hitl_notional_usd` → HITL_REQUIRED, **independently of whether a KeeperHub payload exists** (the check precedes it) | gate.ts ll. 109–116 vs. l. 117 |
| `outcomeBody_blocked_missing_keeperhub` | All guards pass but no KeeperHub payload → BLOCKED | gate.ts ll. 117–124 |
| `outcomeBody_locked_of_all_pass` | All guards pass → LOCKED | gate.ts ll. 126–130 |
| `outcomeBody_range` | The ladder's result is always BLOCKED, HITL_REQUIRED, or LOCKED — never EXPLORING/PROVISIONAL | gate.ts ll. 28–130 (whole ladder) |
| **`outcome_locked_all_guards`** | **LOCKED ⇒ not a hold ∧ every guard passed** (notional present, chain resolvable + allowlisted, venue present + allowlisted, tokens ok, ≤ max notional, projected ≤ daily cap, confidence present + ≥ min, < HITL threshold, KeeperHub payload present). `hitlOnLowConf` is (correctly) unconstrained | gate.ts ll. 16–130 |
| `outcome_hitl_characterization` | HITL_REQUIRED ⇒ all pre-confidence guards passed ∧ (low-confidence fork with the flag set) ∨ (HITL threshold hit) | gate.ts ll. 100–116 |

### Transitions and traces

| Theorem | Claim | Source |
|---|---|---|
| `terminal_no_step` | LOCKED / HITL_REQUIRED / BLOCKED have no outgoing transition | gate.ts (decision is returned, never re-entered); README "no approval UI to promote it to LOCKED" |
| `exploring_steps_only` | From EXPLORING: only stay (hold) or advance to PROVISIONAL — no decision state is reachable directly | gate.ts ll. 21–26 |
| `reach_terminal_absorbing` | Once a trace reaches a terminal state, it stays there | `Step` definition |
| `blocked_never_reaches_locked` | No trace promotes BLOCKED → LOCKED | corollary |
| `hitl_never_reaches_locked` | No trace promotes HITL_REQUIRED → LOCKED | corollary; matches README's stated limitation |
| `reach_closed` / `reach_from_exploring` | Anything reachable from EXPLORING is EXPLORING, PROVISIONAL, or terminal | `Step` definition |
| `trail_chain` | The `trail` the gate actually returns is always a legal `Chain` of `Step`s | gate.ts ll. 18, 26; `finish` ll. 132–154 (push at l. 140 only if the state differs from the last element) |
| `trail_last` | The returned decision state is the last element of the returned trail | gate.ts `finish` ll. 132–154 |
| `chain_terminal_tail_nil` | In any legal trace a terminal state occurs only as the final element | `Step` definition |

### Ledger

| Theorem / def | Claim | Source |
|---|---|---|
| `Entry`, `lastMac` | Entry shape; "previous hash" = last entry's `hmac`, GENESIS (`"0"*64`) when empty | ledger.ts ll. 14–21 (entry type), l. 26 (GENESIS), l. 39 |
| `Linked` | The linkage invariant: head points at GENESIS, each entry's `prevHash` = previous entry's `hmac` | ledger.ts `verify` ll. 55–63 |
| `linked_head_prev` | First entry of a linked chain points at GENESIS | verify ll. 56–60 |
| `linked_snoc` | Appending a correctly linked entry preserves the invariant | append ll. 38–51 |
| `appendEntry`, `appendEntry_prev`, `appendEntry_seq` | Append sets `prevHash` to the chain's last MAC and `seq = length + 1`, by construction | ledger.ts ll. 39–40 |
| `buildFrom_linked`, `build_linked` | Any chain built by repeated `append` from empty is `Linked`, for **any** MAC function and payloads | append ll. 38–51 |
| `linked_prev_eq` | Pairwise form: the entry at any position stores exactly the running MAC of its prefix (GENESIS for the first, previous `hmac` afterwards) | verify ll. 55–77 |
| `linksFrom`, `linksFrom_iff` | The boolean linkage check (the linkage half of `verify()`) passes **iff** the chain is `Linked` — model and code checker agree | verify ll. 55–63 |

## Findings

### Consistent with the README (verified, no action needed)

- The documented sequence `EXPLORING → PROVISIONAL → LOCKED |
  HITL_REQUIRED | BLOCKED` (README; gate.ts header comment) is exactly
  what the code produces. Trails are only `[EXPLORING]` (hold) and
  `[EXPLORING, PROVISIONAL, X]`. **No undocumented transitions exist** —
  in particular there is no direct `EXPLORING → LOCKED` edge and no way
  to re-enter or promote a finished decision.
- The pipeline honours the gate: `src/pipeline.ts` ll. 54–71 calls
  simulate/execute only when `decision.state === "LOCKED"` (and a
  KeeperHub payload exists), matching the README's "Never called unless
  state is LOCKED".
- The gate checks the same chain id the executor uses:
  `compileAlmanakIntent` (`src/almanak/adapter.ts` ll. 105–114) sets
  `plan.keeperHub.chainId` from the same `chainId` value the gate
  validates — no validate-one/execute-another gap.

### Discrepancies and risks

1. **HITL threshold is checked before the missing-payload check, so an
   unexecutable plan can be labelled HITL_REQUIRED.** `gate.ts`
   ll. 109–116 run before l. 117. A plan at/above `hitl_notional_usd`
   with **no KeeperHub payload at all** returns `HITL_REQUIRED`, not
   `BLOCKED` — even though there is nothing a human could approve into
   execution (and the README says there is no approval path anyway).
   Execution is still impossible (pipeline requires LOCKED), so the
   impact is audit semantics: the ledger records a "human required"
   state for a plan that was actually malformed. Proved as
   `outcomeBody_hitl_threshold` (the result does not depend on
   `hasKeeperHub`).
2. **Token allowlist is silently disabled when empty (fail-open by
   omission).** `gate.ts` l. 62 only enforces tokens when
   `policy.allowedTokens.size > 0`, and `allowed_tokens` defaults to
   `[]` in the zod schema (`src/chp/policy.ts` l. 16). A policy that
   omits the field gets *no* token enforcement. This is asymmetric with
   venues/chains, where an empty allowlist blocks everything
   (`.has(...)` is just false). The model takes `tokensOk` as an input
   boolean, so this configuration behaviour is outside the proved
   theorems — the proofs assume the loop's outcome.
3. **`chainAllowed` is an OR of id and name (policy.ts ll. 66–71).** A
   plan passes if *either* its numeric chain id *or* its chain name
   (the raw Almanak intent string, `plan.intent.chain`) is allowlisted,
   while execution uses the numeric id. Allowlisting by name therefore
   delegates the actual id check to the adapter's name→id resolution
   (`KEEPERHUB_CHAIN_ID`-driven). Not a bypass on its own, but the
   gate's guarantee is weaker than "chain id ∈ allowlist".
4. **The ledger is trusted on load; `verify()` is never called before
   the chain is used.** `HmacAuditLedger.load()` (ledger.ts ll. 93–97)
   parses the JSONL file into memory with no integrity check, and the
   constructor happily chains onto whatever it finds. In the pipeline,
   `dailySpentUsd()` is computed from those unverified entries
   (`src/pipeline.ts` l. 46), and `append()` extends the loaded tail
   (`prevHash` = the last stored `hmac`, ledger.ts l. 39) — so a
   truncated or edited ledger file silently *understates* daily spend
   (weakening the daily-cap guard) and the tampered tail gets extended
   rather than detected. `verify()` is only exercised by the demo CLI
   (`src/cli/demo.ts` l. 179) and tests. Note `dailySpentUsd` counts
   only entries whose payload decision state is `LOCKED` (ledger.ts
   ll. 79–89) and trusts the stored `notionalUsd`/timestamps.
5. **Hardcoded fallback HMAC key.** `src/lib/config.ts` l. 37:
   `process.env.AUDIT_LEDGER_KEY?.trim() || "demo-ledger-key-not-for-production"`,
   and `.env.example` ships that literal as the value. With the demo
   key in force, anyone can forge a complete, `verify()`-passing chain —
   an HMAC proves integrity only against parties without the key.
   `.env.example` does say "Replace before any real funds", but the
   fallback is silent: nothing in the demo output flags that the demo
   key is in use.
6. **`verify()` does not check `seq` continuity.** It checks prevHash
   linkage, the payload hash, and the HMAC (ledger.ts ll. 55–77). The
   `seq` value is inside the MAC input (l. 44), so tampering with a
   stored `seq` is caught via the MAC — but a chain whose `seq`s are
   non-monotonic would pass `verify()` if the MACs were computed over
   those values (e.g. by anyone holding the key, see finding 5, or the
   constructor's `entries` parameter, which accepts pre-built entries
   unchecked). Low severity.
7. **Non-constant-time MAC comparison.** `verify()` compares HMACs and
   hashes with `!==` (ledger.ts ll. 58, 63, 70). Standard practice
   would be `timingSafeEqual`; impact is minimal for a local audit
   file, noted for completeness.
8. **Daily-cap TOCTOU across processes.** `dailySpentUsd` is read from
   in-memory entries loaded once at construction; two processes sharing
   one ledger file can each approve up to the full daily cap
   concurrently, and their appends interleave without any locking.
   Within one process the flow is sequential, so this is a
   deployment-shape risk only.
9. **`dailyRemainingUsd` excludes the current plan.** `finish`
   (gate.ts ll. 141–145) computes remaining as `cap − dailySpent`
   (floored at 0) *without* subtracting the just-decided notional, so a
   LOCKED decision's reported remaining overstates what is actually
   left after that trade. Display-only.
10. **Guard ordering shapes the reported reason.** Max-notional is
    checked before the daily cap (ll. 74 vs. 83), and both before
    confidence — a plan failing several checks reports the earliest.
    Cosmetic, but it also means ordering between *terminal labels*
    matters in exactly one place beyond reasons: finding 1.
11. **No persisted session state.** Because each evaluation starts
    fresh at EXPLORING, a strategy that re-emits the same intent after
    a HITL_REQUIRED decision simply re-enters the gate; nothing in the
    gate itself debounces repeat HITL/BLOCKED decisions (only the
    ledger's daily-spend accounting accumulates, and only for LOCKED).
    Consistent with the README, but worth knowing before treating the
    state names as a lifecycle.
