# City of Agents — Player Guide

> *"The game is about the gap between what you promise and what actually happens."*

You are the **Mayor** of a real-world city. Govern it through a series of policy turns, manage a cabinet of AI-driven ministers, navigate media cycles and opposition attacks, and survive an election — all while trying to actually improve people's lives.

---

## How to Start

### 1. Choose Your City
Pick from **New Delhi, Dubai, London, New York,** or **San Francisco**. Each city comes with real-world problems baked in — Delhi has pollution and income disparity, San Francisco has a housing crisis, London has infrastructure pressure.

Set two parameters:
- **Turns to Election** (5–10) — the election happens on the second-to-last turn
- **Population** (millions) — narrative flavor

The game generates your city's profile: 13 city parameters (0–100), demographics, media landscape, budget, and communal tension baseline.

### 2. Form Your Cabinet
You're shown ~15 citizen candidates with visible traits — name, profession, aptitude radar (Intellect, Charisma, Agility, Experience), and a Political Risk rating.

**What you don't see:** exact personality scores. The most competent-looking candidate might secretly be the most corrupt. You're hiring under asymmetric information.

Assign **5 ministers** to **7 portfolios**:

| Portfolio | What It Controls |
|---|---|
| Finance & Economy | Jobs & Commerce |
| Infrastructure | Transit & Roads, Water/Power/Sanitation |
| Health & Education | Hospitals, Schools |
| Housing & Community | Affordable Housing, Community Spaces |
| Home Affairs | Police & Emergency, Courts & Legal |
| Environment | Air Quality & Pollution |
| Governance Reform | Admin Efficiency, Anti-Corruption, Media Freedom |

Some ministers will hold **dual portfolios** — this imposes an execution penalty (2 portfolios = 85%, 3 = 75%).

---

## Each Turn

### Step 1 — Briefing
Review the dashboard: 13 city parameters, budget, active crises, minister loyalty, and the previous turn's delivery scorecard. The **Ward Report** shows which demographic groups are trending up or down.

### Step 2 — Consult Your Cabinet
This is the heart of the game. Chat freely with your ministers in real-time:
- **@FirstName** to address a specific minister
- **@all** to broadcast
- Or just type — the system routes your message to the most relevant minister

Ministers respond **in character**. High-ambition ministers push expensive projects. Low-integrity ministers never suggest anti-corruption reforms. High-empathy ministers focus on vulnerable populations.

**The conversation shapes your options** — if you discuss housing, you'll get housing policy options. If you raise communal tension, your policies will reflect that.

### Step 3 — Choose Your Policy
The system generates **5 policy options** based on your consultation. Each shows:
- Name, description, target effects, side effects
- Budget cost and time profile (immediate vs. multi-turn)
- Which portfolio it falls under

Pick **1 Major Policy** + **1 Minor Action** (see below). Assign a minister to execute the major policy.

### Step 4 — Watch It (Partially) Happen
Your policy goes through two filters:

**Minister Execution** — based on competence, managerial skill, conscientiousness, bureaucratic navigation. Typical: 35–70%.

**City Institutional Filter** — based on Admin Efficiency, Anti-Corruption, and institutional base. Strong city: 60–80%. Weak city: 25–40%.

**The cruel asymmetry:** Positive effects are scaled by execution score. Negative side effects land at **full strength**. A 50% execution rate means half the promised jobs but 100% of the construction pollution.

**Corruption leakage** also occurs — low-integrity ministers steal from the budget, building their Scandal Exposure meter.

### Step 5 — The World Reacts
- **City parameters** shift (delivered effects + side effects + decay + events)
- **Citizen wellbeing** updates — the same policy change affects a poor worker differently than a rich professional
- **Media** publishes biased narratives; scandals may break
- **Citizens voice reactions** (approve / disapprove / undecided)
- **Opposition attacks** your weakest front
- **Events** may trigger (crises or opportunities)

---

## The 13 City Parameters

All scored 0–100. These are your core levers.

**Layer A — Economic & Infrastructure**
- Jobs & Commerce — broadest welfare impact
- Transit & Roads — distributed across all dimensions
- Water, Power & Sanitation — Health + Safety focused

**Layer B — Human & Social**
- Hospitals & Clinics — concentrated Health impact
- Schools & Universities — long-term, indirect
- Affordable Housing — touches all 4 wellbeing dimensions
- Community & Public Spaces — Social cohesion, reduces communal tension

**Layer C — Safety & Environment**
- Police & Emergency — concentrated Safety
- Courts & Legal — Safety + Wealth protection
- Air Quality & Pollution — Health + Social

**Layer D — Meta-Parameters (Governance)**
- **Admin Efficiency** — THE FILTER: determines what fraction of your policies actually get delivered
- **Anti-Corruption** — THE PLUG: determines how much budget leaks to corrupt actors
- **Media Freedom** — THE SPOTLIGHT: exposes corruption, raises citizen awareness, forces accountability

> **Key insight:** Layer D doesn't directly improve citizen lives, but it makes *every future policy* dramatically more effective. A weak city delivers 35% of your intent. A strong city delivers 65%.

---

## Minor Actions

You get one per turn alongside your major policy:

| Action | Cost | Effect |
|---|---|---|
| Sector Maintenance | 50 Cr | Prevent decay on 1 parameter for 2 turns |
| Budget Banking | Free | Skip — gain +20 Cr bonus |
| Cabinet Reshuffle | Free | Reassign, fire, or hire a minister (1-turn execution penalty) |
| Press Conference | 30 Cr | +3 Mayor Alignment with a target demographic (3-turn cooldown) |
| Emergency Fund | ≤100 Cr | Boost crisis response by +0.15 this turn |
| Governance Upkeep | 60 Cr | Direct +1 to Admin Efficiency, Anti-Corruption, or Media Freedom (bypasses the execution engine) |

---

## Maintenance Decay

Any parameter not targeted for **2 consecutive turns** automatically declines ~1.5 points/turn. With 13 parameters and only 1–2 policy slots, you **cannot maintain everything**. You must triage.

---

## Corruption

Corrupt ministers quietly steal from every policy they execute. Each act:
- Drains the treasury
- Damages Anti-Corruption and Admin Efficiency
- Builds Scandal Exposure

When media catches it (probability depends on Media Freedom, outlet trust, opposition pressure), a **scandal breaks** — damaging your approval, minister loyalty, and citizen alignment.

---

## The Election

On the configured election turn, **ALL citizens vote** — not just the vocal minority that drives your dashboard approval.

- **Landslide (>65%):** Loyalty boost, opposition weakened
- **Comfortable (55–65%):** Normal continuation
- **Narrow (50–55%):** Loyalty hit, opposition strengthened
- **Loss (<50%): GAME OVER**

> **The trap:** High dashboard approval ≠ election win. Your interim approval is weighted toward politically active, educated, urban citizens. But the **silent majority** — the poor, the rural, the disengaged — votes on election day too. Neglect them at your peril.

---

## Events

**Crises** trigger when parameters drop too low (e.g., Crime Wave when Police < 30, Disease Outbreak when Water/Sanitation < 20). They damage parameters every turn they're active.

**Opportunities** (tech investment bids, international recognition) have a **1-turn window** — invest via Emergency Fund or miss them.

---

## Loss Conditions

| Condition | Trigger |
|---|---|
| Electoral Defeat | Vote share < 50% on election turn |
| Governance Collapse | Admin Efficiency < 10 for 3 consecutive turns |
| City in Crisis | 3+ parameters below 15 simultaneously |
| Bankruptcy | Debt maxed AND treasury negative |
| Mass Despair | Average citizen wellbeing < 20 for 3+ turns |

---

## Legacy Phase (Post-Election)

Survive the election and the game shifts to **legacy building**:
- A Legacy Scorecard tracks 7 governance metrics in real-time
- Budget ceiling scales with your election margin
- Governance investments compound faster
- Special events at Turn 15 (Mid-Term Review) and Turn 18 (Legacy Summit)

---

## Final Score (7 Metrics)

| Metric | Weight |
|---|---|
| Final Approval | 20% |
| Wellbeing Equity (gap between richest and poorest) | 15% |
| Institutional Legacy (governance parameter improvement) | 20% |
| Budget Health | 10% |
| Crisis Record | 10% |
| Promise-Delivery Ratio | 10% |
| Cabinet Integrity | 15% |

### Legacy Titles

| Score | Title |
|---|---|
| 90–100 | **"The Reformer"** — transformed the city's structural foundations |
| 70–89 | **"The Steady Hand"** — made real progress without destabilizing |
| 50–69 | **"The Survivor"** — stayed in power but changed little |
| 30–49 | **"The Populist"** — short-term wins, long-term structural damage |
| 0–29 | **"The Bureaucrat's Friend"** — corruption flourished, institutions decayed |

---

## Strategy Tips

1. **Invest in governance early.** P11/P12/P13 don't show up as visible citizen wins, but they make every future policy 20–30% more effective. Neglect them and you spend the whole game achieving 40% of everything.

2. **Hire for integrity, not just competence.** A brilliant but corrupt minister siphons budget, damages institutions, and eventually explodes in a scandal. A moderately capable but honest minister is often the better long-term bet.

3. **The silent majority votes.** Don't chase dashboard approval from the vocal urban elite while neglecting housing, jobs, and basic services for the poor. They remember on election day.

4. **Your consultation matters.** The 5 policy options you receive are generated from your cabinet conversation. Talk about what you want to fix.

5. **Maintenance is underrated.** Letting a recently-targeted parameter skip decay for 2 turns preserves your investment. The Sector Maintenance minor action costs only 50 Cr.

6. **Dual portfolios compound problems.** A minister covering 3 portfolios executes at 75% *before* their personal quality factors in. Keep critical portfolios single-assigned.

7. **Media Freedom is a double-edged sword.** High media freedom exposes corruption faster (good) but also gives the opposition more airtime and makes your approval more volatile.
