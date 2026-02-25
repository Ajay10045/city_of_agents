Q1 — What is the Minor Action?
In the doc: Section 5.4 of core_engine_v4.md

It's the second action you take every turn, alongside the major policy. It's a small focused action from a fixed menu — not LLM-generated. Options:

Minor Action	Cost	Effect
Sector Maintenance	50 Cr	Prevents 1 param from decaying this turn AND next
Budget Banking	0	Do nothing; treasury gains +20 Cr
Cabinet Reshuffle	0	Reassign portfolios or swap a minister
Press Conference	30 Cr	+3 mayor alignment for a specific demographic group
Emergency Fund	up to 100 Cr	Crisis response boost
Governance Upkeep	60 Cr	+1.0 directly to P11/P12/P13, bypassing the implementation engine
Rationale: Solves the "governance investment is suicidal" problem — the major policy slot is used for visible improvements, the minor action quietly maintains the plumbing (P11/P12/P13). Budget Banking is the "do nothing useful" fallback.

Current implementation issue: Our code only implements 3 of the 6 options (banking, maintenance, governance_upkeep). Missing: cabinet_reshuffle, press_conference, emergency_fund.

Q2 — What is Governance Upkeep?
It's the minor action that adds +1.0 directly to one of P11 (admin_efficiency), P12 (anti_corruption), or P13 (media_freedom), bypassing the implementation engine entirely. It costs 60 Cr.

Current implementation bug: The code applies +1.0 to all three P11/P12/P13 simultaneously — which is wrong. It should only boost the one the player picks. Also, the cost (60 Cr) is being deducted but the target param is not being selected by the player — the UI just sends governance_upkeep with no target specified.

Q3 — How are target_effects and side_effects calculated?
They are LLM judgement — the policy draft LLM generates them. But they are constrained:

target_effects values capped at ±10 per parameter
side_effects values capped at ±5 per parameter
Must not overlap (can't target and side-effect the same param)
Must belong to the declared portfolio
The LLM is prompted with the full consultation transcript + city state, and is instructed to show real trade-offs. Then the implementation engine scales target_effects by execution score (positive effects only — negative always land at 100%). Side effects are also asymmetric: negative side effects land at full force, positive side effects are scaled by execution score.

Q4 — Revenue calculation?
Section 14.1:


tax_revenue = base_tax_revenue × (jobs_and_commerce / 50.0) × (1 - corruption_leakage)
corruption_leakage = (100 - anti_corruption) / 100 × 0.15
base_tax_revenue comes from the City Profile (LLM-generated, e.g. 180 Cr/turn). If jobs_and_commerce is at 50 (baseline), you get exactly base_tax_revenue. Higher jobs → more revenue. Corruption leaks up to 15% of revenue when anti_corruption is 0.

Q5 — Minister score: what is consc and bur, and the 0.85 penalty?
Section 6.1:

consc = Conscientiousness — work ethic, follow-through (a personality trait)
bur = Bureaucratic Navigation — ability to work within bureaucratic systems (a capability trait)
Formula:


MinisterExecScore = (
    Competence × 0.35
  + ManagSkill  × 0.30
  + Conscientiousness × 0.20
  + BureaucraticNav   × 0.15
) / 100
0.85 portfolio penalty (Section 4.2): If a minister holds 2 portfolios, their exec score is multiplied by 0.85. 3 portfolios → 0.75. Because managing more departments = divided attention = less delivery. This is fixed in the doc.

Q6 — Corruption formula — is it in the doc?
Yes, exactly in Section 7:


intent  = (100 - minister.integrity) / 100 × 0.40
window  = ((100-police)×0.20 + (100-courts)×0.20 + (100-admin)×0.15 + (100-anti_corr)×0.25 + (100-media_free)×0.20) / 100
leakage = intent × window × budget_factor
stolen  = policy_budget × leakage × 0.15
The 0.15 cap ensures no single act drains too much. It's fully deterministic from the city profile.

Q7 — Why is the effect split across turns, and why not side effects?
Section 6.5 (time_profile): The LLM declares how fast a policy delivers. Metro rail doesn't happen overnight — so the policy itself specifies {"turn_0": 0.40, "turn_1": 0.35, "turn_2": 0.25} meaning 40% now, 35% next turn, 25% the turn after.

Side effects are NOT split because the doc says they represent the disruption of implementation itself (construction noise, displacement) — that happens immediately regardless of the policy timeline. A road being built displaces hawkers today, even if the road won't be finished for 3 turns.

Current code bug: Side effects are not split across the time profile — which is correct per the spec. But the log shows water_power_sanitation as the only protected param while side effects decay — worth checking if carry-over params are properly marked as "targeted" to prevent decay (Section 6.5 says they should be).

Q8 — Decay calculation?
Section 14.3:


decay_rate = 1.5 × (1 - admin_efficiency / 200.0)
Any parameter NOT targeted this turn OR last turn decays by decay_rate per turn. So with admin_efficiency = 55, decay = 1.5 × (1 - 55/200) = 1.5 × 0.725 = 1.09/turn per param.

The 12 decaying params you saw is expected when you only targeted 1 param that turn. The fix is: use major policies that target more params, use the Maintenance minor action to protect a 2nd param, use governance upkeep to protect P11/P12/P13.

Q9 — The 500 error after wellbeing update
The wellbeing calculation runs for all 50 citizens. The error happening right after Avg wellbeing: 51.66 → 51.83 means the crash is in the code after wellbeing — most likely in:

check_scandal_break() (scandal check)
compute_interim_approval() (approval calculation)
pick_attack_strategy() (opposition)
Wellbeing deltas are aggregated across all citizens — you see the average. Individual citizen calculations happen per-citizen but only the average is shown in the log.