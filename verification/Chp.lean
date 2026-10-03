/-
  Chp.lean — Lean 4 (core library only) model of the Cubiczan CHP gate
  and HMAC audit ledger in almanak-keeperhub-chp.

  Sources modelled:
    * src/chp/states.ts  — the five CHP states.
    * src/chp/gate.ts    — `evaluateGate` (the decision function and the
      `trail` it narrates) and `finish`.
    * src/chp/policy.ts  — `chainAllowed` (abstracted as a boolean guard).
    * src/chp/ledger.ts  — `HmacAuditLedger.append` / `verify`
      (hash chaining modelled abstractly; SHA-256 / HMAC internals are
      opaque functions, since the linkage properties do not depend on
      them).

  Compile:  ~/.elan/bin/lean Chp.lean
-/

namespace Chp

/-! ## States (states.ts ll. 5–11) -/

inductive State where
  | exploring
  | provisional
  | locked
  | hitlRequired
  | blocked
deriving DecidableEq, Repr

/-! ## The gate (gate.ts `evaluateGate`, ll. 17–132)

`evaluateGate` is a single-pass decision function: it starts every
evaluation in EXPLORING, optionally advances to PROVISIONAL, and finishes
in exactly one of LOCKED / HITL_REQUIRED / BLOCKED (or EXPLORING itself
for an `Intent.hold`).  We abstract the plan + policy into the boolean
outcomes of the individual checks, in the exact order the code performs
them; decimal comparisons (lib/money `compareDecimal`) become booleans.

Guard order in the code:
  1. `plan.kind === "hold"`                       (l. 21)
  2. missing notional                             (l. 28)  → BLOCKED
  3. unresolvable chain id                        (l. 33)  → BLOCKED
  4. chain not allowlisted (`chainAllowed`)       (l. 41)  → BLOCKED
  5. missing venue                                (l. 49)  → BLOCKED
  6. venue not allowlisted                       (l. 54)  → BLOCKED
  7. token not allowlisted (only checked when
     the policy token allowlist is non-empty)     (l. 62)  → BLOCKED
  8. notional > max_notional                      (l. 74)  → BLOCKED
  9. spent + notional > daily_cap                 (ll. 82–83) → BLOCKED
 10. missing confidence                           (l. 92)  → BLOCKED
 11. confidence < min_confidence                 (l. 100) → HITL if
     `hitlOnLowConfidence`, else BLOCKED
 12. notional ≥ hitl_notional                     (l. 109) → HITL_REQUIRED
 13. missing KeeperHub payload                    (l. 117) → BLOCKED
 14. otherwise                                    (l. 126) → LOCKED
-/

structure Guards where
  hold : Bool
  hasNotional : Bool
  hasChainId : Bool
  chainAllowed : Bool
  hasVenue : Bool
  venueAllowed : Bool
  tokensOk : Bool
  overMaxNotional : Bool
  overDailyCap : Bool
  hasConfidence : Bool
  belowMinConf : Bool
  hitlOnLowConf : Bool
  overHitl : Bool
  hasKeeperHub : Bool

/-- The post-PROVISIONAL ladder of `evaluateGate` (gate.ts ll. 28–130). -/
def outcomeBody (g : Guards) : State :=
  if !g.hasNotional then .blocked
  else if !g.hasChainId then .blocked
  else if !g.chainAllowed then .blocked
  else if !g.hasVenue then .blocked
  else if !g.venueAllowed then .blocked
  else if !g.tokensOk then .blocked
  else if g.overMaxNotional then .blocked
  else if g.overDailyCap then .blocked
  else if !g.hasConfidence then .blocked
  else if g.belowMinConf then (if g.hitlOnLowConf then .hitlRequired else .blocked)
  else if g.overHitl then .hitlRequired
  else if !g.hasKeeperHub then .blocked
  else .locked

/-- The decision state returned by `evaluateGate`. -/
def outcome (g : Guards) : State :=
  if g.hold then .exploring else outcomeBody g

/-- The `trail` returned by `evaluateGate` + `finish` (gate.ts ll. 18,
    26, 132–154): `[EXPLORING]` for a hold (finish does not re-append the
    current state), otherwise `[EXPLORING, PROVISIONAL, final]`. -/
def trail (g : Guards) : List State :=
  if g.hold then [.exploring] else [.exploring, .provisional, outcomeBody g]

/-! ### Forward guard lemmas: a failing check determines the outcome -/

theorem outcome_hold (g : Guards) (h : g.hold = true) : outcome g = .exploring := by
  simp [outcome, h]

theorem outcomeBody_blocked_missing_notional (g : Guards)
    (h : g.hasNotional = false) : outcomeBody g = .blocked := by
  simp [outcomeBody, h]

theorem outcomeBody_blocked_unknown_chain (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = false) :
    outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2]

theorem outcomeBody_blocked_chain_not_allowed (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = false) : outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3]

theorem outcomeBody_blocked_missing_venue (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = false) :
    outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3, h4]

theorem outcomeBody_blocked_venue_not_allowed (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = false) : outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3, h4, h5]

theorem outcomeBody_blocked_token_not_allowed (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = false) :
    outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6]

theorem outcomeBody_blocked_over_max_notional (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = true) : outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6, h7]

theorem outcomeBody_blocked_over_daily_cap (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = true) :
    outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6, h7, h8]

theorem outcomeBody_blocked_missing_confidence (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = false)
    (h9 : g.hasConfidence = false) : outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6, h7, h8, h9]

/-- The low-confidence fork (gate.ts ll. 100–107): below-minimum
    confidence routes to HITL exactly when the policy sets
    `hitl_on_low_confidence`, and to BLOCKED otherwise. -/
theorem outcomeBody_low_confidence (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = false)
    (h9 : g.hasConfidence = true) (h10 : g.belowMinConf = true) :
    outcomeBody g = (if g.hitlOnLowConf then .hitlRequired else .blocked) := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6, h7, h8, h9, h10]

theorem outcomeBody_low_conf_hitl (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = false)
    (h9 : g.hasConfidence = true) (h10 : g.belowMinConf = true)
    (h11 : g.hitlOnLowConf = true) : outcomeBody g = .hitlRequired := by
  have hf := outcomeBody_low_confidence g h1 h2 h3 h4 h5 h6 h7 h8 h9 h10
  rw [hf]; simp [h11]

theorem outcomeBody_low_conf_blocked (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = false)
    (h9 : g.hasConfidence = true) (h10 : g.belowMinConf = true)
    (h11 : g.hitlOnLowConf = false) : outcomeBody g = .blocked := by
  have hf := outcomeBody_low_confidence g h1 h2 h3 h4 h5 h6 h7 h8 h9 h10
  rw [hf]; simp [h11]

/-- The HITL-threshold check (gate.ts ll. 109–116, the `hitl_threshold`
    branch) runs *before* the missing-execution-plan check (l. 117), so
    its outcome does not depend on `hasKeeperHub`. -/
theorem outcomeBody_hitl_threshold (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = false)
    (h9 : g.hasConfidence = true) (h10 : g.belowMinConf = false)
    (h11 : g.overHitl = true) : outcomeBody g = .hitlRequired := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11]

theorem outcomeBody_blocked_missing_keeperhub (g : Guards)    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = false)
    (h9 : g.hasConfidence = true) (h10 : g.belowMinConf = false)
    (h11 : g.overHitl = false) (h12 : g.hasKeeperHub = false) :
    outcomeBody g = .blocked := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11, h12]

theorem outcomeBody_locked_of_all_pass (g : Guards)
    (h1 : g.hasNotional = true) (h2 : g.hasChainId = true)
    (h3 : g.chainAllowed = true) (h4 : g.hasVenue = true)
    (h5 : g.venueAllowed = true) (h6 : g.tokensOk = true)
    (h7 : g.overMaxNotional = false) (h8 : g.overDailyCap = false)
    (h9 : g.hasConfidence = true) (h10 : g.belowMinConf = false)
    (h11 : g.overHitl = false) (h12 : g.hasKeeperHub = true) :
    outcomeBody g = .locked := by
  simp [outcomeBody, h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11, h12]

/-! ### Range and reverse characterizations -/

/-- The post-PROVISIONAL ladder can only end in BLOCKED, HITL_REQUIRED,
    or LOCKED — never back in EXPLORING or PROVISIONAL.  (Proved by
    walking the same decision tree as the code, closing each branch
    with the corresponding forward lemma.) -/
theorem outcomeBody_range (g : Guards) :
    outcomeBody g = .blocked ∨ outcomeBody g = .hitlRequired ∨
    outcomeBody g = .locked := by
  cases h1 : g.hasNotional with
  | false => exact Or.inl (outcomeBody_blocked_missing_notional g h1)
  | true =>
    cases h2 : g.hasChainId with
    | false => exact Or.inl (outcomeBody_blocked_unknown_chain g h1 h2)
    | true =>
      cases h3 : g.chainAllowed with
      | false => exact Or.inl (outcomeBody_blocked_chain_not_allowed g h1 h2 h3)
      | true =>
        cases h4 : g.hasVenue with
        | false => exact Or.inl (outcomeBody_blocked_missing_venue g h1 h2 h3 h4)
        | true =>
          cases h5 : g.venueAllowed with
          | false =>
            exact Or.inl (outcomeBody_blocked_venue_not_allowed g h1 h2 h3 h4 h5)
          | true =>
            cases h6 : g.tokensOk with
            | false =>
              exact Or.inl (outcomeBody_blocked_token_not_allowed g h1 h2 h3 h4 h5 h6)
            | true =>
              cases h7 : g.overMaxNotional with
              | true =>
                exact Or.inl (outcomeBody_blocked_over_max_notional g h1 h2 h3 h4 h5 h6 h7)
              | false =>
                cases h8 : g.overDailyCap with
                | true =>
                  exact Or.inl (outcomeBody_blocked_over_daily_cap g h1 h2 h3 h4 h5 h6 h7 h8)
                | false =>
                  cases h9 : g.hasConfidence with
                  | false =>
                    exact Or.inl (outcomeBody_blocked_missing_confidence g h1 h2 h3 h4
                      h5 h6 h7 h8 h9)
                  | true =>
                    cases h10 : g.belowMinConf with
                    | true =>
                      cases h11 : g.hitlOnLowConf with
                      | true =>
                        exact Or.inr (Or.inl (outcomeBody_low_conf_hitl g h1 h2 h3 h4
                          h5 h6 h7 h8 h9 h10 h11))
                      | false =>
                        exact Or.inl (outcomeBody_low_conf_blocked g h1 h2 h3 h4 h5 h6
                          h7 h8 h9 h10 h11)
                    | false =>
                      cases h11 : g.overHitl with
                      | true =>
                        exact Or.inr (Or.inl (outcomeBody_hitl_threshold g h1 h2 h3 h4
                          h5 h6 h7 h8 h9 h10 h11))
                      | false =>
                        cases h12 : g.hasKeeperHub with
                        | false =>
                          exact Or.inl (outcomeBody_blocked_missing_keeperhub g h1 h2
                            h3 h4 h5 h6 h7 h8 h9 h10 h11 h12)
                        | true =>
                          exact Or.inr (Or.inr (outcomeBody_locked_of_all_pass g h1 h2
                            h3 h4 h5 h6 h7 h8 h9 h10 h11 h12))

/-- **Headline safety theorem.** If the gate returns LOCKED, then the
    intent was not a hold and *every* policy guard passed: notional
    present, chain resolvable and allowlisted, venue present and
    allowlisted, tokens allowlisted, notional within max, projected
    daily spend within cap, confidence present and at/above minimum,
    notional below the HITL threshold, and a KeeperHub payload present.
    (The value of `hitlOnLowConf` is unconstrained — it is irrelevant
    once confidence passes.) -/
theorem outcome_locked_all_guards (g : Guards) (h : outcome g = .locked) :
    g.hold = false ∧ g.hasNotional = true ∧ g.hasChainId = true ∧
    g.chainAllowed = true ∧ g.hasVenue = true ∧ g.venueAllowed = true ∧
    g.tokensOk = true ∧ g.overMaxNotional = false ∧
    g.overDailyCap = false ∧ g.hasConfidence = true ∧
    g.belowMinConf = false ∧ g.overHitl = false ∧
    g.hasKeeperHub = true := by
  have hhold : g.hold = false := by
    cases hh : g.hold with
    | true => rw [outcome_hold g hh] at h; cases h
    | false => rfl
  have hbody : outcomeBody g = .locked := by
    have : outcome g = outcomeBody g := by simp [outcome, hhold]
    rw [this] at h; exact h
  have hnot : g.hasNotional = true := by
    cases hh : g.hasNotional with
    | true => rfl
    | false => rw [outcomeBody_blocked_missing_notional g hh] at hbody; cases hbody
  have hchain : g.hasChainId = true := by
    cases hh : g.hasChainId with
    | true => rfl
    | false => rw [outcomeBody_blocked_unknown_chain g hnot hh] at hbody; cases hbody
  have hcallow : g.chainAllowed = true := by
    cases hh : g.chainAllowed with
    | true => rfl
    | false => rw [outcomeBody_blocked_chain_not_allowed g hnot hchain hh] at hbody; cases hbody
  have hvenue : g.hasVenue = true := by
    cases hh : g.hasVenue with
    | true => rfl
    | false => rw [outcomeBody_blocked_missing_venue g hnot hchain hcallow hh] at hbody; cases hbody
  have hvallow : g.venueAllowed = true := by
    cases hh : g.venueAllowed with
    | true => rfl
    | false =>
      rw [outcomeBody_blocked_venue_not_allowed g hnot hchain hcallow hvenue hh] at hbody
      cases hbody
  have htok : g.tokensOk = true := by
    cases hh : g.tokensOk with
    | true => rfl
    | false =>
      rw [outcomeBody_blocked_token_not_allowed g hnot hchain hcallow hvenue hvallow hh] at hbody
      cases hbody
  have hmax : g.overMaxNotional = false := by
    cases hh : g.overMaxNotional with
    | false => rfl
    | true =>
      rw [outcomeBody_blocked_over_max_notional g hnot hchain hcallow hvenue hvallow htok hh] at hbody
      cases hbody
  have hcap : g.overDailyCap = false := by
    cases hh : g.overDailyCap with
    | false => rfl
    | true =>
      rw [outcomeBody_blocked_over_daily_cap g hnot hchain hcallow hvenue hvallow htok hmax hh] at hbody
      cases hbody
  have hconf : g.hasConfidence = true := by
    cases hh : g.hasConfidence with
    | true => rfl
    | false =>
      rw [outcomeBody_blocked_missing_confidence g hnot hchain hcallow hvenue hvallow htok hmax hcap hh] at hbody
      cases hbody
  have hbelow : g.belowMinConf = false := by
    cases hh : g.belowMinConf with
    | false => rfl
    | true =>
      have hfork := outcomeBody_low_confidence g hnot hchain hcallow hvenue hvallow htok
        hmax hcap hconf hh
      rw [hfork] at hbody
      cases hh2 : g.hitlOnLowConf with
      | true => simp [hh2] at hbody
      | false => simp [hh2] at hbody
  have hhitl : g.overHitl = false := by
    cases hh : g.overHitl with
    | false => rfl
    | true =>
      rw [outcomeBody_hitl_threshold g hnot hchain hcallow hvenue hvallow htok hmax hcap
        hconf hbelow hh] at hbody
      cases hbody
  have hkh : g.hasKeeperHub = true := by
    cases hh : g.hasKeeperHub with
    | true => rfl
    | false =>
      rw [outcomeBody_blocked_missing_keeperhub g hnot hchain hcallow hvenue hvallow htok
        hmax hcap hconf hbelow hhitl hh] at hbody
      cases hbody
  exact ⟨hhold, hnot, hchain, hcallow, hvenue, hvallow, htok, hmax, hcap,
    hconf, hbelow, hhitl, hkh⟩

/-- HITL_REQUIRED arises in exactly two ways (given the earlier guards
    pass, which this extracts along the way): the low-confidence fork
    with `hitl_on_low_confidence` set, or the notional HITL threshold. -/
theorem outcome_hitl_characterization (g : Guards)
    (h : outcome g = .hitlRequired) :
    g.hold = false ∧ g.hasNotional = true ∧ g.hasChainId = true ∧
    g.chainAllowed = true ∧ g.hasVenue = true ∧ g.venueAllowed = true ∧
    g.tokensOk = true ∧ g.overMaxNotional = false ∧
    g.overDailyCap = false ∧ g.hasConfidence = true ∧
    ((g.belowMinConf = true ∧ g.hitlOnLowConf = true) ∨
     (g.belowMinConf = false ∧ g.overHitl = true)) := by
  have hhold : g.hold = false := by
    cases hh : g.hold with
    | true => rw [outcome_hold g hh] at h; cases h
    | false => rfl
  have hbody : outcomeBody g = .hitlRequired := by
    have : outcome g = outcomeBody g := by simp [outcome, hhold]
    rw [this] at h; exact h
  have hnot : g.hasNotional = true := by
    cases hh : g.hasNotional with
    | true => rfl
    | false => rw [outcomeBody_blocked_missing_notional g hh] at hbody; cases hbody
  have hchain : g.hasChainId = true := by
    cases hh : g.hasChainId with
    | true => rfl
    | false => rw [outcomeBody_blocked_unknown_chain g hnot hh] at hbody; cases hbody
  have hcallow : g.chainAllowed = true := by
    cases hh : g.chainAllowed with
    | true => rfl
    | false => rw [outcomeBody_blocked_chain_not_allowed g hnot hchain hh] at hbody; cases hbody
  have hvenue : g.hasVenue = true := by
    cases hh : g.hasVenue with
    | true => rfl
    | false => rw [outcomeBody_blocked_missing_venue g hnot hchain hcallow hh] at hbody; cases hbody
  have hvallow : g.venueAllowed = true := by
    cases hh : g.venueAllowed with
    | true => rfl
    | false =>
      rw [outcomeBody_blocked_venue_not_allowed g hnot hchain hcallow hvenue hh] at hbody
      cases hbody
  have htok : g.tokensOk = true := by
    cases hh : g.tokensOk with
    | true => rfl
    | false =>
      rw [outcomeBody_blocked_token_not_allowed g hnot hchain hcallow hvenue hvallow hh] at hbody
      cases hbody
  have hmax : g.overMaxNotional = false := by
    cases hh : g.overMaxNotional with
    | false => rfl
    | true =>
      rw [outcomeBody_blocked_over_max_notional g hnot hchain hcallow hvenue hvallow htok hh] at hbody
      cases hbody
  have hcap : g.overDailyCap = false := by
    cases hh : g.overDailyCap with
    | false => rfl
    | true =>
      rw [outcomeBody_blocked_over_daily_cap g hnot hchain hcallow hvenue hvallow htok hmax hh] at hbody
      cases hbody
  have hconf : g.hasConfidence = true := by
    cases hh : g.hasConfidence with
    | true => rfl
    | false =>
      rw [outcomeBody_blocked_missing_confidence g hnot hchain hcallow hvenue hvallow htok hmax hcap hh] at hbody
      cases hbody
  have hfork : (g.belowMinConf = true ∧ g.hitlOnLowConf = true) ∨
      (g.belowMinConf = false ∧ g.overHitl = true) := by
    cases hh : g.belowMinConf with
    | true =>
      have hfl := outcomeBody_low_confidence g hnot hchain hcallow hvenue hvallow htok
        hmax hcap hconf hh
      rw [hfl] at hbody
      cases hh2 : g.hitlOnLowConf with
      | true => exact Or.inl ⟨rfl, rfl⟩
      | false => simp [hh2] at hbody
    | false =>
      have hhitl : g.overHitl = true := by
        cases hh3 : g.overHitl with
        | true => rfl
        | false =>
          cases hh4 : g.hasKeeperHub with
          | true =>
            rw [outcomeBody_locked_of_all_pass g hnot hchain hcallow hvenue hvallow htok
              hmax hcap hconf hh hh3 hh4] at hbody
            cases hbody
          | false =>
            rw [outcomeBody_blocked_missing_keeperhub g hnot hchain hcallow hvenue hvallow
              htok hmax hcap hconf hh hh3 hh4] at hbody
            cases hbody
      exact Or.inr ⟨rfl, hhitl⟩
  exact ⟨hhold, hnot, hchain, hcallow, hvenue, hvallow, htok, hmax, hcap,
    hconf, hfork⟩

/-! ## Transition relation and traces

The trail a single evaluation narrates induces exactly five legal
transitions.  There is deliberately no edge out of LOCKED,
HITL_REQUIRED, or BLOCKED: a decision is final (the README notes there
is no approval path that promotes HITL_REQUIRED to LOCKED). -/

inductive Step : State → State → Prop
  | holdLoop : Step .exploring .exploring
  | advance : Step .exploring .provisional
  | toBlocked : Step .provisional .blocked
  | toHitl : Step .provisional .hitlRequired
  | toLocked : Step .provisional .locked

def Terminal (s : State) : Prop :=
  s = .locked ∨ s = .hitlRequired ∨ s = .blocked

/-- Terminal states are absorbing: no transition leaves them. -/
theorem terminal_no_step {s t : State} (h : Terminal s) (hs : Step s t) :
    False := by
  cases h with
  | inl h1 => subst h1; cases hs
  | inr h2 =>
    cases h2 with
    | inl h3 => subst h3; cases hs
    | inr h4 => subst h4; cases hs

/-- No transition skips PROVISIONAL on the way to a decision: from
    EXPLORING one can only stay (hold) or advance to PROVISIONAL. -/
theorem exploring_steps_only {t : State} (hs : Step .exploring t) :
    t = .exploring ∨ t = .provisional := by
  cases hs with
  | holdLoop => exact Or.inl rfl
  | advance => exact Or.inr rfl

/-- Reflexive-transitive closure of `Step` (hypothetical multi-step
    traces, e.g. if decisions were ever chained). -/
inductive Reach : State → State → Prop
  | refl (s : State) : Reach s s
  | step {a b c : State} : Step a b → Reach b c → Reach a c

/-- Once a trace reaches a terminal state it can never leave it. -/
theorem reach_terminal_absorbing {s t : State} (hT : Terminal s)
    (h : Reach s t) : s = t := by
  cases h with
  | refl => rfl
  | step hs _ => exact (terminal_no_step hT hs).elim

/-- A BLOCKED decision can never be promoted to LOCKED. -/
theorem blocked_never_reaches_locked : ¬ Reach .blocked .locked := by
  intro h
  have hEq := reach_terminal_absorbing (s := .blocked) (t := .locked)
    (Or.inr (Or.inr rfl)) h
  cases hEq

/-- A HITL_REQUIRED decision can never be promoted to LOCKED. -/
theorem hitl_never_reaches_locked : ¬ Reach .hitlRequired .locked := by
  intro h
  have hEq := reach_terminal_absorbing (s := .hitlRequired) (t := .locked)
    (Or.inr (Or.inl rfl)) h
  cases hEq

/-- Closure of the reachable set: a step from a "live" state
    (EXPLORING / PROVISIONAL / terminal) lands in a live state. -/
theorem reach_closed {a s : State} (h : Reach a s) :
    (a = .exploring ∨ a = .provisional ∨ Terminal a) →
    (s = .exploring ∨ s = .provisional ∨ Terminal s) := by
  induction h with
  | refl => intro ha; exact ha
  | step hab _ ih =>
    intro _
    apply ih
    cases hab with
    | holdLoop => exact Or.inl rfl
    | advance => exact Or.inr (Or.inl rfl)
    | toBlocked => exact Or.inr (Or.inr (Or.inr (Or.inr rfl)))
    | toHitl => exact Or.inr (Or.inr (Or.inr (Or.inl rfl)))
    | toLocked => exact Or.inr (Or.inr (Or.inl rfl))

/-- Every state reachable from EXPLORING is one of the five states, and
    in particular a decision state is reachable only via PROVISIONAL
    (see `exploring_steps_only`). -/
theorem reach_from_exploring {s : State} (h : Reach .exploring s) :
    s = .exploring ∨ s = .provisional ∨ Terminal s :=
  reach_closed h (Or.inl rfl)

/-! ## List traces -/

/-- A list of states in which consecutive elements are related by
    `Step` — the shape of the `trail` values the gate returns. -/
inductive Chain : List State → Prop
  | nil : Chain []
  | single (s : State) : Chain [s]
  | cons (s t : State) (l : List State) :
      Step s t → Chain (t :: l) → Chain (s :: t :: l)

/-- The trail the gate produces is always a legal trace and uses only
    `Step` transitions. -/
theorem trail_chain (g : Guards) : Chain (trail g) := by
  cases hh : g.hold with
  | true =>
    have : trail g = [.exploring] := by simp [trail, hh]
    rw [this]
    exact Chain.single _
  | false =>
    have ht : trail g = [.exploring, .provisional, outcomeBody g] := by
      simp [trail, hh]
    rw [ht]
    have hstep : Step .provisional (outcomeBody g) := by
      have hr := outcomeBody_range g
      cases hr with
      | inl h1 => rw [h1]; exact Step.toBlocked
      | inr h2 =>
        cases h2 with
        | inl h3 => rw [h3]; exact Step.toHitl
        | inr h4 => rw [h4]; exact Step.toLocked
    exact Chain.cons _ _ _ Step.advance (Chain.cons _ _ _ hstep (Chain.single _))

/-- The trail ends in the decision state the gate returns (the
    `GateDecision.state` equals the last element of `GateDecision.trail`
    in the code). -/
theorem trail_last (g : Guards) : (trail g).getLast? = some (outcome g) := by
  cases hh : g.hold with
  | true => simp [trail, outcome, hh]
  | false => simp [trail, outcome, hh]

/-- In any legal trace, a terminal state can only appear as the final
    element: the tail after it must be empty. -/
theorem chain_terminal_tail_nil {s : State} {l : List State}
    (hC : Chain (s :: l)) (hT : Terminal s) : l = [] := by
  cases l with
  | nil => rfl
  | cons t l' =>
    cases hC with
    | cons _ _ _ hs _ => exact (terminal_no_step hT hs).elim

/-! ## HMAC audit ledger (ledger.ts)

`HmacAuditLedger.append` (ll. 38–51) computes, for each new entry,
`prevHash = entries.at(-1)?.hmac ?? GENESIS`, `seq = entries.length + 1`,
and an HMAC over `seq|timestamp|prevHash|payloadHash`.  `verify`
(ll. 55–77) replays the chain checking exactly this linkage (plus the
payload hash and the MAC itself).

Hashes are modelled abstractly: `H` is the hash type and `macOf` is the
(opaque) MAC computation as a function of `(seq, prevHash, payload)` —
the code additionally mixes in the timestamp and the payload *hash*;
neither affects the linkage properties proved here. -/

section Ledger

variable {H P : Type}

structure Entry (H P : Type) where
  seq : Nat
  prev : H
  payload : P
  mac : H

/-- The hash a new entry must point back to: the last entry's `hmac`,
    or GENESIS when the chain is empty — as a fold over the entry list
    (oldest first, as stored by the code). -/
def lastMac (genesis : H) : List (Entry H P) → H
  | [] => genesis
  | e :: l => lastMac e.mac l

/-- The linkage invariant checked by `verify()`: the head entry points
    at the starting hash (GENESIS for a full chain) and every following
    entry's stored `prevHash` equals the previous entry's `hmac`. -/
inductive Linked (genesis : H) : H → List (Entry H P) → Prop
  | nil {start : H} : Linked genesis start []
  | cons {start : H} (e : Entry H P) {l : List (Entry H P)} :
      e.prev = start → Linked genesis e.mac l → Linked genesis start (e :: l)

/-- The first entry of a linked chain points at GENESIS. -/
theorem linked_head_prev {genesis : H} {e : Entry H P} {l : List (Entry H P)}
    (h : Linked genesis genesis (e :: l)) : e.prev = genesis := by
  cases h with
  | cons _ hp _ => exact hp

/-- Appending a correctly-linked entry at the tail preserves the
    invariant — this is the induction step behind `append`. -/
theorem linked_snoc {genesis start : H} {l : List (Entry H P)}
    (h : Linked genesis start l) :
    ∀ e : Entry H P, e.prev = lastMac start l →
      Linked genesis start (l ++ [e]) := by
  induction h with
  | nil =>
    intro e he
    exact Linked.cons e he Linked.nil
  | cons e₀ hp _ ih =>
    intro e he
    exact Linked.cons e₀ hp (ih e he)

/-- `append`, with the MAC computation abstracted as `macOf`. -/
def appendEntry (genesis : H) (macOf : Nat → H → P → H)
    (l : List (Entry H P)) (p : P) : Entry H P where
  seq := l.length + 1
  prev := lastMac genesis l
  payload := p
  mac := macOf (l.length + 1) (lastMac genesis l) p

/-- The appended entry points back at the chain's last MAC (or
    GENESIS) — by construction, mirroring ledger.ts l. 39. -/
theorem appendEntry_prev (genesis : H) (macOf : Nat → H → P → H)
    (l : List (Entry H P)) (p : P) :
    (appendEntry genesis macOf l p).prev = lastMac genesis l := rfl

/-- The appended entry's sequence number is `length + 1`
    (ledger.ts l. 40). -/
theorem appendEntry_seq (genesis : H) (macOf : Nat → H → P → H)
    (l : List (Entry H P)) (p : P) :
    (appendEntry genesis macOf l p).seq = l.length + 1 := rfl

/-- Building a chain by repeated appends, starting from a given
    (already linked) prefix. -/
def buildFrom (genesis : H) (macOf : Nat → H → P → H)
    (l : List (Entry H P)) : List P → List (Entry H P)
  | [] => l
  | p :: ps => buildFrom genesis macOf (l ++ [appendEntry genesis macOf l p]) ps

/-- A chain built by appending stays linked, whatever the MAC function
    and whatever the payloads. -/
theorem buildFrom_linked (genesis : H) (macOf : Nat → H → P → H)
    {l : List (Entry H P)} (h : Linked genesis genesis l) (ps : List P) :
    Linked genesis genesis (buildFrom genesis macOf l ps) := by
  induction ps generalizing l with
  | nil => exact h
  | cons p ps ih =>
    exact ih (linked_snoc h _ (appendEntry_prev genesis macOf l p))

/-- In particular, any chain produced by `append` from the empty chain
    satisfies the `verify()` linkage invariant. -/
theorem build_linked (genesis : H) (macOf : Nat → H → P → H)
    (ps : List P) :
    Linked genesis genesis (buildFrom genesis macOf [] ps) :=
  buildFrom_linked genesis macOf Linked.nil ps

/-- **Pairwise chain property.** In any linked chain, the entry at any
    position stores as its `prevHash` exactly the running MAC of the
    prefix before it — i.e. GENESIS for the first entry and the previous
    entry's `hmac` for every later one. -/
theorem linked_prev_eq {genesis start : H} {l₁ : List (Entry H P)}
    {e : Entry H P} {l₂ : List (Entry H P)}
    (h : Linked genesis start (l₁ ++ e :: l₂)) :
    e.prev = lastMac start l₁ := by
  induction l₁ generalizing start with
  | nil =>
    cases h with
    | cons _ hp _ => exact hp
  | cons a l₁ ih =>
    cases h with
    | cons _ _ hrest => exact ih hrest

/-- The linkage half of the code's `verify()` as a boolean checker
    (ledger.ts ll. 55–63: the running `prev` comparison). -/
def linksFrom [DecidableEq H] (start : H) : List (Entry H P) → Bool
  | [] => true
  | e :: l => decide (e.prev = start) && linksFrom e.mac l

/-- The boolean linkage check passes exactly on the linked chains:
    the model invariant and the code's `verify()` linkage check agree. -/
theorem linksFrom_iff [DecidableEq H] {genesis : H} :
    ∀ (start : H) (l : List (Entry H P)),
    linksFrom start l = true ↔ Linked genesis start l := by
  intro start l
  induction l generalizing start with
  | nil => exact ⟨fun _ => Linked.nil, fun _ => rfl⟩
  | cons e l ih =>
    constructor
    · intro h
      have h1 : (decide (e.prev = start) && linksFrom e.mac l) = true := h
      rw [Bool.and_eq_true] at h1
      have hp : e.prev = start := of_decide_eq_true h1.1
      exact Linked.cons e hp ((ih e.mac).mp h1.2)
    · intro h
      cases h with
      | cons _ hp hrest =>
        have hd : decide (e.prev = start) = true := by
          rw [decide_eq_true_eq]
          exact hp
        have hr : linksFrom e.mac l = true := (ih e.mac).mpr hrest
        simp only [linksFrom, hd, hr, Bool.true_and]

end Ledger

end Chp
