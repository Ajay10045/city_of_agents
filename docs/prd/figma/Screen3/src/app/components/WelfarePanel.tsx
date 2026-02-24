import { Heart, Coins, Shield, Users, MapPin, Info, ChevronRight } from "lucide-react";

const GAME_STREAM_IMAGE =
  "https://images.unsplash.com/photo-1758402601411-bd8d6be42633?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZXRybyUyMGNvbnN0cnVjdGlvbiUyMHVyYmFuJTIwY2l0eSUyMGluZnJhc3RydWN0dXJlfGVufDF8fHx8MTc3MTkxNzUxOXww&ixlib=rb-4.1.0&q=80&w=1080";

type WelfareStat = {
  label: string;
  score: number;
  delta: number;
  stroke: string;
  glow: string;
  trackColor: string;
  gradientId: string;
  gradientFrom: string;
  gradientTo: string;
  Icon: React.ElementType;
  bg: string;
};

const welfareStats: WelfareStat[] = [
  {
    label: "Health",
    score: 68,
    delta: +11,
    stroke: "#22c55e",
    glow: "#16a34a",
    trackColor: "#0a2010",
    gradientId: "healthGrad",
    gradientFrom: "#22c55e",
    gradientTo: "#86efac",
    Icon: Heart,
    bg: "rgba(34,197,94,0.08)",
  },
  {
    label: "Wealth",
    score: 65,
    delta: +10,
    stroke: "#38bdf8",
    glow: "#0284c7",
    trackColor: "#071a28",
    gradientId: "wealthGrad",
    gradientFrom: "#38bdf8",
    gradientTo: "#7dd3fc",
    Icon: Coins,
    bg: "rgba(56,189,248,0.08)",
  },
  {
    label: "Safety",
    score: 55,
    delta: +7,
    stroke: "#f59e0b",
    glow: "#d97706",
    trackColor: "#1a1000",
    gradientId: "safetyGrad",
    gradientFrom: "#f59e0b",
    gradientTo: "#fcd34d",
    Icon: Shield,
    bg: "rgba(245,158,11,0.08)",
  },
  {
    label: "Society",
    score: 32,
    delta: -6,
    stroke: "#f87171",
    glow: "#dc2626",
    trackColor: "#200a0a",
    gradientId: "societyGrad",
    gradientFrom: "#f87171",
    gradientTo: "#fca5a5",
    Icon: Users,
    bg: "rgba(248,113,113,0.08)",
  },
];

const turnHistory = [
  {
    turn: 4,
    actor: "Mayor",
    actorColor: "#e8a030",
    title: "Metro Expansion Phase",
    time: "Today, 3:40 PM",
    description: "Work underway on metro lines & flyover",
    diamond: true,
  },
  {
    turn: 3,
    actor: "Opposition",
    actorColor: "#f87171",
    title: "Populist Housing Pledge",
    time: "Yesterday",
    description: "New housing policy promised.",
    diamond: false,
  },
  {
    turn: 2,
    actor: null,
    actorColor: "",
    title: "Foundational Stats Applied",
    time: "",
    description: "",
    diamond: false,
    tags: [
      { label: "Inequality +5", bg: "rgba(248,113,113,0.12)", border: "#7f1d1d", color: "#fca5a5" },
      { label: "Popularity +5", bg: "rgba(34,197,94,0.12)", border: "#14532d", color: "#86efac" },
      { label: "Unemployment -5", bg: "rgba(56,189,248,0.12)", border: "#0c4a6e", color: "#7dd3fc" },
    ],
  },
];

const streamEffects = [
  { label: "Happiness +11", color: "#22c55e", up: true },
  { label: "Transit Capacity +15", color: "#38bdf8", up: true },
  { label: "Social Tension -8", color: "#f87171", up: false },
];

function WelfareRing({ stat }: { stat: WelfareStat }) {
  const R = 30;
  const circ = 2 * Math.PI * R;
  const fill = (stat.score / 100) * circ;
  const { Icon } = stat;

  return (
    <div
      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-lg relative overflow-hidden"
      style={{
        background: stat.bg,
        border: `1px solid ${stat.stroke}22`,
        flex: 1,
      }}
    >
      {/* Top colored bar accent */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: 2, background: `linear-gradient(90deg, ${stat.gradientFrom}, ${stat.gradientTo})` }}
      />

      {/* SVG Ring */}
      <div style={{ position: "relative", width: 74, height: 74 }}>
        <svg viewBox="0 0 74 74" width="74" height="74">
          <defs>
            <linearGradient id={stat.gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={stat.gradientFrom} />
              <stop offset="100%" stopColor={stat.gradientTo} />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle cx="37" cy="37" r={R} fill="none" stroke={stat.trackColor} strokeWidth="7" />
          {/* Progress */}
          <circle
            cx="37" cy="37" r={R} fill="none"
            stroke={`url(#${stat.gradientId})`}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${fill} ${circ}`}
            transform="rotate(-90 37 37)"
            style={{ filter: `drop-shadow(0 0 6px ${stat.glow})` }}
          />
        </svg>
        {/* Center content */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
        >
          <Icon size={14} color={stat.stroke} strokeWidth={2.5} />
          <span
            className="text-white mt-0.5"
            style={{ fontSize: 17, fontWeight: 700, fontFamily: "'Share Tech Mono', monospace", lineHeight: 1 }}
          >
            {stat.score}
          </span>
        </div>
      </div>

      {/* Delta */}
      <div className="flex items-center gap-1">
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: stat.delta > 0 ? "#22c55e" : "#f87171",
            fontFamily: "'Share Tech Mono', monospace",
          }}
        >
          {stat.delta > 0 ? `▲ +${stat.delta}` : `▼ ${stat.delta}`}
        </span>
      </div>

      {/* Label */}
      <span
        className="text-gray-400"
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", fontFamily: "'Rajdhani', sans-serif", textTransform: "uppercase" }}
      >
        {stat.label}
      </span>
    </div>
  );
}

const panelStyle = {
  background: "linear-gradient(180deg, #0b1929 0%, #091422 100%)",
  border: "1px solid #1c3652",
  borderRadius: 6,
};

export function WelfarePanel() {
  return (
    <div className="flex-1 flex flex-col gap-2 min-w-0">
      {/* Welfare Indicators */}
      <div style={panelStyle} className="shrink-0">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid #1c3652" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full bg-amber-400" style={{ boxShadow: "0 0 6px #f59e0b" }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", color: "#e8a030" }}>
              WELFARE INDICATORS
            </span>
          </div>
          <button
            className="flex items-center gap-1.5 px-2 py-1 rounded transition-all"
            style={{ border: "1px solid #1c3652", fontSize: 10, color: "#4b6280", fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.05em" }}
          >
            View All Parameters <ChevronRight size={10} />
          </button>
        </div>
        <div className="p-2.5 flex gap-2">
          {welfareStats.map((stat) => (
            <WelfareRing key={stat.label} stat={stat} />
          ))}
        </div>
      </div>

      {/* Game Stream */}
      <div style={panelStyle} className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div
          className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{ borderBottom: "1px solid #1c3652" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded flex items-center justify-center"
              style={{ background: "rgba(232,160,48,0.15)", border: "1px solid #92400e" }}
            >
              <span style={{ color: "#e8a030", fontSize: 10 }}>▶</span>
            </div>
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", color: "#e8a030" }}>
              GAME STREAM
            </span>
          </div>
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded"
            style={{ background: "rgba(239,68,68,0.2)", border: "1px solid #991b1b" }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ boxShadow: "0 0 4px #f87171" }} />
            <span style={{ color: "#f87171", fontSize: 9, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.1em" }}>
              +1 LIVE
            </span>
          </div>
        </div>

        {/* Stream Image */}
        <div className="relative shrink-0" style={{ height: 185 }}>
          <img src={GAME_STREAM_IMAGE} alt="Metro Expansion" className="w-full h-full object-cover" />
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(5,13,27,0.97) 0%, rgba(5,13,27,0.3) 55%, transparent 100%)" }}
          />
          {/* Corner accent */}
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded"
            style={{ background: "rgba(5,13,27,0.7)", border: "1px solid rgba(232,160,48,0.3)", backdropFilter: "blur(4px)" }}
          >
            <span style={{ color: "#e8a030", fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.12em", fontWeight: 700 }}>
              TURN 4 · ACTIVE EVENT
            </span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <div
              className="text-white uppercase tracking-wide"
              style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.08em" }}
            >
              Metro Expansion Underway
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <MapPin size={10} color="#94a3b8" />
              <span className="text-gray-400" style={{ fontSize: 10 }}>Sabarmati District</span>
            </div>
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              {streamEffects.map((effect) => (
                <span
                  key={effect.label}
                  className="flex items-center gap-1"
                  style={{ fontSize: 10, fontWeight: 700, color: effect.color, fontFamily: "'Share Tech Mono', monospace" }}
                >
                  <span style={{ fontSize: 8 }}>{effect.up ? "▲" : "▼"}</span>
                  {effect.label}
                </span>
              ))}
              <button
                className="ml-auto flex items-center justify-center rounded transition-all"
                style={{ width: 20, height: 20, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
              >
                <Info size={11} color="#94a3b8" />
              </button>
            </div>
          </div>
        </div>

        {/* Turn History */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {turnHistory.map((turn, i) => (
            <div
              key={i}
              className="px-3 py-2.5 cursor-pointer transition-all"
              style={{ borderBottom: "1px solid #1c3652" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              <div className="flex items-start gap-2">
                <div
                  className="shrink-0 mt-0.5 px-2 py-0.5 rounded"
                  style={{
                    background: "rgba(232,160,48,0.12)",
                    border: "1px solid rgba(232,160,48,0.3)",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#e8a030",
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                  }}
                >
                  TURN {turn.turn}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                    {turn.actor && (
                      <>
                        <span style={{ fontSize: 10, fontWeight: 700, color: turn.actorColor }}>{turn.actor}:</span>
                        <span className="text-white" style={{ fontSize: 10, fontWeight: 600 }}>{turn.title}</span>
                      </>
                    )}
                    {!turn.actor && <span className="text-white" style={{ fontSize: 10, fontWeight: 600 }}>{turn.title}</span>}
                    {turn.time && <span className="text-gray-600 ml-auto" style={{ fontSize: 9 }}>{turn.time}</span>}
                  </div>
                  {turn.description && (
                    <div className="text-gray-500 mt-0.5 flex items-center gap-1" style={{ fontSize: 10 }}>
                      {turn.description}
                      {turn.diamond && <span style={{ color: "#e8a030", fontSize: 8 }}>◆</span>}
                    </div>
                  )}
                  {turn.tags && (
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {turn.tags.map((tag) => (
                        <span
                          key={tag.label}
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            fontSize: 9,
                            color: tag.color,
                            background: tag.bg,
                            border: `1px solid ${tag.border}`,
                            fontFamily: "'Share Tech Mono', monospace",
                          }}
                        >
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
