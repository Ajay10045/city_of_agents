# City of Agents — UI Build Plan (Isolated, Testable)

> **Goal:** Build a production-quality React frontend that can run standalone with mock data, no backend dependency. The UI connects to the backend later via a clean API layer swap.

---

## 0. Source of Truth

| Screen | Source | Status |
|--------|--------|--------|
| **Screen 1 — City Selection** | `figma/Design three screens (1)/CitySelection.tsx` | Good. Sliders + city cards. Minor text cleanup needed (Figma OCR artifacts: "Bianamagazam", "Poisennanagam" etc.) |
| **Screen 2 — Cabinet Selection** | `figma/Design three screens (1)/CabinetSelection.tsx` | Good. Full minister attributes, portfolio drag-assign, star ratings. |
| **Screen 3 — Game Dashboard** | `figma/Screen3/` (TopBar, AdvisoryChat, WelfarePanel, IdentityPanel) | Best quality. Real text, proper fonts. Reference image: `images/UI_v3.png` for expected look. Known issues: some font fallbacks and icon/image mismatches vs reference. |

**Discarding:** `figma/Design three screens/` (original, superseded by `(1)` revision).

---

## 1. Tech Stack Decision

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Framework** | React 18 + TypeScript | Already used in Figma exports |
| **Build** | Vite | Already configured |
| **Styling** | Tailwind CSS 4 + inline styles | Figma exports use both; keep as-is |
| **Component Lib** | shadcn/ui (already exported) | Button, Badge, Slider, Input, ScrollArea, etc. |
| **Fonts** | Google Fonts: Rajdhani, Inter, Share Tech Mono | Only Screen3 loads them; must apply globally |
| **Icons** | lucide-react | Already in use |
| **State** | React Context + useState (no Redux needed yet) | Game state is turn-based, not deeply nested |
| **Mock Data** | Static JSON fixtures + faker helpers | Enables full UI testing without backend |
| **Routing** | React Router (already a dep, currently unused) | Replace state-based screen switch |

---

## 2. Project Structure

```
frontend/
├── index.html
├── package.json                  ← cleaned: remove unused deps (MUI, recharts, react-dnd, slick, masonry)
├── vite.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                  ← entry point
│   ├── App.tsx                   ← router setup
│   ├── styles/
│   │   ├── globals.css           ← Tailwind base + dark theme variables
│   │   └── fonts.css             ← Google Fonts import (Rajdhani, Inter, Share Tech Mono)
│   ├── types/
│   │   ├── city.ts               ← CityProfile, CityParameter types from engine spec
│   │   ├── citizen.ts            ← Citizen, Minister, WellbeingState types
│   │   ├── game.ts               ← GameState, TurnState, Policy types
│   │   └── media.ts              ← MediaOutlet, OppositionState types
│   ├── mock/
│   │   ├── cities.ts             ← 5 city profiles with real data (Delhi, Ranpur, Karachi, Dhaka, Colombo)
│   │   ├── ministers.ts           ← 6-8 minister candidates per city
│   │   ├── game-state.ts         ← Mock turn state (turn 4 of 30, budgets, crises)
│   │   ├── citizens.ts           ← 50 citizen-agents with demographics + wellbeing
│   │   └── media.ts              ← Media outlets + headlines + chatter
│   ├── context/
│   │   └── GameContext.tsx        ← React context: selectedCity, cabinet, currentTurn, gameState
│   ├── hooks/
│   │   ├── useGameState.ts       ← Hook to read/mutate game context
│   │   └── useMobile.ts          ← Existing mobile detection hook
│   ├── lib/
│   │   └── utils.ts              ← cn() helper (existing)
│   ├── components/
│   │   ├── ui/                   ← shadcn primitives (existing, cleaned)
│   │   ├── shared/
│   │   │   ├── ImageWithFallback.tsx  ← existing, handles broken Unsplash URLs
│   │   │   ├── StarRating.tsx         ← extracted from CabinetSelection
│   │   │   ├── LoyaltyArc.tsx         ← extracted SVG ring widget
│   │   │   ├── WelfareRing.tsx        ← extracted SVG gauge widget
│   │   │   └── MiniBar.tsx            ← extracted progress bar widget
│   │   ├── screens/
│   │   │   ├── CitySelection/
│   │   │   │   ├── CitySelection.tsx
│   │   │   │   ├── CityCard.tsx       ← individual city card
│   │   │   │   └── GameSettings.tsx   ← turns + population sliders
│   │   │   ├── CabinetSelection/
│   │   │   │   ├── CabinetSelection.tsx
│   │   │   │   ├── ApplicantCard.tsx  ← minister candidate card
│   │   │   │   ├── CabinetSlot.tsx    ← selected minister + portfolio badges
│   │   │   │   └── PortfolioBar.tsx   ← unallocated portfolios strip
│   │   │   └── GameDashboard/
│   │   │       ├── GameDashboard.tsx  ← main 3-column layout
│   │   │       ├── TopBar.tsx
│   │   │       ├── AdvisoryChat/
│   │   │       │   ├── AdvisoryChat.tsx
│   │   │       │   ├── AdvisorList.tsx
│   │   │       │   ├── ChatThread.tsx
│   │   │       │   ├── ChatInput.tsx
│   │   │       │   └── CrisisPanel.tsx
│   │   │       ├── WelfarePanel/
│   │   │       │   ├── WelfarePanel.tsx
│   │   │       │   ├── WelfareIndicators.tsx
│   │   │       │   ├── GameStream.tsx
│   │   │       │   └── TurnHistory.tsx
│   │   │       └── IdentityPanel/
│   │   │           ├── IdentityPanel.tsx
│   │   │           ├── IdentityGroups.tsx
│   │   │           ├── MediaSection.tsx
│   │   │           └── CityChatter.tsx
│   └── api/
│       └── client.ts             ← API client stub (returns mock data now, swaps to real API later)
```

---

## 3. Build Phases

### Phase 1 — Project Scaffold & Shared Foundation (Day 1)

**Objective:** Single clean Vite project with routing, fonts, theme, shared components, types, and mock data.

| Task | Details |
|------|---------|
| 1.1 Initialize `frontend/` | Copy `package.json` from Screen3; strip unused deps (MUI, recharts, react-dnd, masonry, slick). Add `react-router-dom`. |
| 1.2 Global styles | Merge `fonts.css` (Google Fonts) + dark theme CSS variables into `globals.css`. Ensure Rajdhani/Inter/Share Tech Mono load on all screens. |
| 1.3 TypeScript types | Define `CityProfile`, `CityParameter`, `Citizen`, `Minister`, `GameState`, `Policy`, `MediaOutlet`, `TurnReport` — aligned to core_engine_v3 schema. |
| 1.4 Mock data layer | Create static JSON fixtures for: 5 cities, minister candidates, sample turn state (turn 4/30), 3 media outlets, 6 identity groups, 3 citizen chatter posts. Data should match the Figma mockups closely. |
| 1.5 GameContext | React context + provider exposing: `selectedCity`, `selectedMinisters`, `gameState`, `currentTurn`, `dispatch`. |
| 1.6 Shared components | Extract reusable widgets: `StarRating`, `LoyaltyArc`, `WelfareRing`, `MiniBar`, `ImageWithFallback`. |
| 1.7 shadcn/ui library | Copy relevant shadcn components: `button`, `badge`, `input`, `slider`, `scroll-area`, `separator`, `tooltip`. Remove the 30+ unused ones. |
| 1.8 Router setup | `App.tsx` with 3 routes: `/` (city selection), `/cabinet` (cabinet), `/game` (dashboard). |
| 1.9 Verify builds | `npm run dev` — all 3 routes render empty shells. |

**Deliverable:** Running app with working navigation between 3 blank screens, all types/mocks/shared widgets ready.

---

### Phase 2 — Screen 1: City Selection (Day 2)

**Objective:** Pixel-accurate city selection screen from the Figma revised export.

| Task | Details |
|------|---------|
| 2.1 `CityCard` component | City photo (Unsplash or local fallback), name, population, growth%, satisfaction%, issue badges. Fix Figma OCR garble: give each city real, sensible issues (e.g., Karachi → "Infrastructure Deficit", "Political Instability"). |
| 2.2 `GameSettings` bar | "Turns to Election" slider + input (range 10–50, default 20 to match engine spec). "Population" slider + input (range 10–100, default 50 agents to match engine spec `agent_count`). |
| 2.3 City grid | 5 cards in a responsive row. Selected card gets amber ring. |
| 2.4 Start Game flow | "Start Game" button → stores selection in `GameContext` → navigates to `/cabinet`. |
| 2.5 Polish | Hover states, transitions, keyboard navigation, responsive breakpoints. |

**Deliverable:** Fully interactive city selection. Selecting a city + adjusting settings + clicking Start navigates to Cabinet.

---

### Phase 3 — Screen 2: Cabinet Selection (Day 3)

**Objective:** Minister selection and portfolio assignment screen.

| Task | Details |
|------|---------|
| 3.1 `ApplicantCard` | Portrait, name, profession, education, 8 attribute star ratings (integrity, authority respect, competence, managerial skill, strategic thinking, crisis handling, bureaucratic navigation). "Add to Cabinet" button. |
| 3.2 `CabinetSlot` | Compact minister card in right sidebar. Portrait, name, profession. Portfolio badges with remove (×) button. "+" button opens portfolio dropdown. |
| 3.3 `PortfolioBar` | Bottom strip showing unallocated portfolios as colored badges. Map to the 7 engine portfolios: Finance & Economy, Infrastructure, Health & Education, Housing & Community, Home Affairs, Environment, Governance Reform. |
| 3.4 Validation | Require: (a) at least 5 ministers selected (= `minister_count` in engine spec), (b) all 7 portfolios allocated. Show warning badges if not met. Disable "Continue" until valid. |
| 3.5 Data binding | Selected ministers + portfolio assignments stored in `GameContext`. "Continue to Game" → navigates to `/game`. |
| 3.6 Portfolio alignment | The current Figma has 12 granular portfolios. Consolidate to the 7 from the engine spec (Section 4.2). Each portfolio controls specific city parameters — show these as subtle labels. |

**Deliverable:** Fully interactive cabinet building. Minister selection, portfolio assignment, validation, navigation to dashboard.

---

### Phase 4 — Screen 3: Game Dashboard (Days 4–6)

The main game screen. This is the most complex — split into sub-phases.

#### Phase 4a — TopBar (Day 4, morning)

| Task | Details |
|------|---------|
| 4a.1 `TopBar` | City emblem + name. Term/Turn display. Budget bar (spent/remaining gradient). Mayor Approval ring + delta. History/Help/Settings icons. "NEXT TURN" golden button. |
| 4a.2 Font fixes | Ensure Rajdhani for headers/labels, Share Tech Mono for numbers, Inter for body. Reference `images/UI_v3.png` for expected rendering. |
| 4a.3 Responsive | TopBar stays fixed, scales gracefully on 1280-1920px widths. |

#### Phase 4b — Left Column: Advisory Chat + Crises (Day 4, afternoon)

| Task | Details |
|------|---------|
| 4b.1 `AdvisorList` | 3 minister-advisors with portrait, name, role, loyalty arc (SVG ring). Clicking an advisor could filter chat to that advisor (future). |
| 4b.2 `ChatThread` | Scrollable chat messages. Mayor messages in amber tint, advisor messages in blue tint. Each message has avatar, name, role, timestamp, styled bubble with left-border color. |
| 4b.3 `ChatInput` | Text input + Send button + "Draft Policy" button. Wire to mock: sending a message appends it to thread and triggers a mock advisor reply after 500ms. |
| 4b.4 `CrisisPanel` | Active crises list with severity badges (HIGH/MEDIUM/LOW), risk percentages, appropriate icons (AlertTriangle, TrendingDown, Droplets). |

#### Phase 4c — Center Column: Welfare + Game Stream (Day 5)

| Task | Details |
|------|---------|
| 4c.1 `WelfareIndicators` | 4 SVG ring gauges: Health, Wealth, Safety, Society. Each shows score (0-100), delta indicator (▲/▼), colored gradient ring. Match the engine's 4 wellbeing dimensions exactly. |
| 4c.2 `GameStream` | Hero image card for current turn's active event. Overlay with event name, location, and stat effects (e.g., "Happiness +11", "Transit Capacity +15", "Social Tension -8"). |
| 4c.3 `TurnHistory` | Vertical timeline of past turns. Each entry: Turn badge, actor (Mayor/Opposition), title, time, description, optional stat tags. |
| 4c.4 "View All Parameters" | Click expands to show all 13 city parameters as a mini bar chart or grid (connect to mock data for P1-P13 values). |

#### Phase 4d — Right Column: Identity + Media + Chatter (Day 5)

| Task | Details |
|------|---------|
| 4d.1 `IdentityGroups` | List of 6 demographic groups. Each shows: icon, name, approval mini-bar + number, divider, influence mini-bar + number. Color-coded per engine identity types. |
| 4d.2 `MediaSection` | 3 media outlets with logo square, outlet name, badge, headline, timestamp. "VIEW ALL MEDIA" expand button. "Chat" button on relevant outlets. |
| 4d.3 `CityChatter` | Social-media-style citizen posts. Avatar (Unsplash or initials), username, handle, timestamp, message bubble. These represent the citizen reactions from engine step ⑧. |

#### Phase 4e — Screen 3 Polish & Reference Match (Day 6)

| Task | Details |
|------|---------|
| 4e.1 Font audit | Compare rendered output against `images/UI_v3.png`. Fix any size, weight, or family mismatches. The reference shows: Rajdhani in all-caps section headers, Share Tech Mono for all numbers/stats, Inter for chat text. |
| 4e.2 Image/Icon audit | Replace any broken Unsplash URLs with working ones or local fallbacks. Ensure all icons match reference (the current export sometimes uses emoji where the reference uses Lucide icons, and vice versa). |
| 4e.3 Layout tuning | Left column = 280px fixed. Right column = 280px fixed. Center = flex-1. Verify on 1440px and 1920px viewports. |
| 4e.4 Interaction states | Hover effects on all clickable items. Smooth transitions. Active/selected states for advisors, crises, identity groups. |
| 4e.5 Loading/empty states | Skeleton loaders for panels. Empty states for chat (no messages), crises (none active), chatter (quiet city). |

---

### Phase 5 — Mock Interactivity & Turn Simulation (Day 7)

**Objective:** Make the UI feel alive without a backend.

| Task | Details |
|------|---------|
| 5.1 "NEXT TURN" flow | Clicking "Next Turn" → brief loading animation → mock data transitions: welfare scores shift randomly ±3-8, budget depletes, turn counter increments, new game stream event appears, turn history entry added. |
| 5.2 Advisory chat mock | Mayor types a message → after 500ms, a random advisor replies with mock text relevant to current crises/events. |
| 5.3 "Draft Policy" flow | Clicking "Draft Policy" → modal/drawer showing 5 mock policy options (name, description, budget, target effects, side effects). Player selects one → confirmation → next turn triggers. |
| 5.4 Minor action menu | Add a minor action selector (perhaps in TopBar or a floating menu): Sector Maintenance, Budget Banking, Cabinet Reshuffle, Public Address, Emergency Fund, Governance Upkeep. Selecting one stores it for the turn. |
| 5.5 Crisis interaction | Clicking a crisis → detail panel showing severity, affected parameters, response options. |
| 5.6 Turn Report overlay | After "Next Turn" resolves → overlay showing: Promise vs Reality scorecard, stat changes, media headlines, citizen voices. Dismiss to see updated dashboard. |

---

### Phase 6 — API Layer Stub (Day 8)

**Objective:** Clean separation between UI and data so backend swap is trivial.

| Task | Details |
|------|---------|
| 6.1 `api/client.ts` | Define API interface: `createGame(cityId, config)`, `getGameState(gameId)`, `submitTurn(gameId, majorPolicy, minorAction)`, `consultMinister(gameId, ministerId, message)`, `getNextTurnReport(gameId)`. |
| 6.2 Mock implementation | Current implementation returns mock data with 200-500ms simulated latency (using `setTimeout`). |
| 6.3 Real implementation | Swap file: `api/client.real.ts` that calls FastAPI backend at `localhost:8000`. Same interface, different implementation. Toggle via env variable `VITE_API_MODE=mock|real`. |

---

## 4. Known Issues to Fix from Figma Export

| # | Issue | Fix |
|---|-------|-----|
| 1 | Garbled text in Screen 1 & 2 (Figma OCR artifacts) | Replace with real city-appropriate text |
| 2 | `fonts.css` empty in Screen 1 & 2 | Apply Google Fonts globally |
| 3 | Dead code: `dashboard/Header.tsx`, `dashboard/LeftSidebar.tsx` in Screen3 | Remove |
| 4 | 30+ unused shadcn components | Keep only: button, badge, input, slider, scroll-area, separator, tooltip, dialog, dropdown-menu, card |
| 5 | 20+ unused npm deps (MUI, recharts, masonry, slick, etc.) | Remove from package.json |
| 6 | All images hotlinked to Unsplash | Keep for dev; add `ImageWithFallback` everywhere. For prod: download key images to `public/images/` |
| 7 | Screen 3 font rendering doesn't match `UI_v3.png` reference | Audit font sizes, weights, letter-spacing per component |
| 8 | Some Screen 3 icons use emoji where reference shows Lucide icons | Replace as needed |
| 9 | Portfolio structure mismatch (12 in Figma vs 7 in engine) | Consolidate to 7 engine portfolios |
| 10 | Hardcoded colors (no CSS variables) | Convert to Tailwind theme tokens for future theme support |
| 11 | No responsive/mobile handling | Add mobile detection; minimum supported width: 1280px with graceful degradation |
| 12 | `CitizenMediaInfluence` vs `MediaInfluence` naming inconsistency in types | Use `MediaInfluence` consistently (aligned with v4 engine fix) |

---

## 5. Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Monorepo? | No — `frontend/` as a separate directory at project root | Simple. Backend is Python/FastAPI. No shared code. |
| State management | React Context + `useReducer` | Turn-based game: state changes are discrete, not continuous. No need for Redux/Zustand complexity. |
| Testing | Vitest + React Testing Library | Already in Vite ecosystem. Test component rendering with mock data. |
| Storybook? | Not yet | Overhead. The mock data + routing gives the same visual testing. Add later if team grows. |
| CSS approach | Keep Tailwind + inline styles (from Figma) | Rewriting to pure Tailwind is polish work. Ship first, refactor after. |
| Image strategy | Unsplash URLs with `ImageWithFallback` | Works offline with placeholder. No need to self-host during dev. |

---

## 6. Definition of Done (Testable UI)

The UI is "done for isolated testing" when:

- [ ] All 3 screens render correctly at 1440px width
- [ ] Navigation: City Selection → Cabinet → Dashboard flows end-to-end
- [ ] City Selection: 5 cities selectable, turns/population adjustable, Start Game works
- [ ] Cabinet: Ministers addable/removable, portfolios assignable, validation enforced
- [ ] Dashboard: All 5 panels populated with mock data (TopBar, AdvisoryChat, Welfare, Identity, Media/Chatter)
- [ ] "NEXT TURN" triggers mock state transition (scores change, turn advances, new events appear)
- [ ] Chat input sends message and receives mock advisor reply
- [ ] "Draft Policy" shows 5 policy options and player can select one
- [ ] Fonts match reference (`UI_v3.png`): Rajdhani headers, Share Tech Mono numbers, Inter body
- [ ] No broken images (fallbacks work)
- [ ] No console errors
- [ ] `npm run build` produces clean production bundle

---

## 7. Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Scaffold | 1 day | Running app, types, mocks, routing |
| Phase 2: City Selection | 1 day | Screen 1 complete |
| Phase 3: Cabinet Selection | 1 day | Screen 2 complete |
| Phase 4: Game Dashboard | 3 days | Screen 3 complete (TopBar, Advisory, Welfare, Identity, Media) |
| Phase 5: Mock Interactivity | 1 day | Turn simulation, chat, policy draft |
| Phase 6: API Stub | 0.5 day | Clean mock/real API toggle |
| **Total** | **~7.5 days** | Full testable UI |

---

*This plan is designed to be executed screen-by-screen, with each phase producing a testable, shippable increment.*
