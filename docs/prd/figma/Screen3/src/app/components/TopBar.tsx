import { ChevronRight, HelpCircle, Settings, Clock, SkipForward } from "lucide-react";

export function TopBar() {
  const spent = 7600;
  const total = 10000;
  const remaining = total - spent;
  const spentPct = (spent / total) * 100;

  return (
    <div
      className="flex items-center gap-4 px-4 shrink-0"
      style={{
        height: 52,
        background: "linear-gradient(90deg, #071320 0%, #0a1828 40%, #071320 100%)",
        borderBottom: "1px solid #1c3652",
        boxShadow: "0 2px 20px rgba(0,0,0,0.5)",
      }}
    >
      {/* City branding */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Emblem */}
        <div
          className="flex items-center justify-center rounded-full shrink-0"
          style={{
            width: 36,
            height: 36,
            background: "linear-gradient(135deg, #b45309 0%, #d97706 50%, #92400e 100%)",
            boxShadow: "0 0 12px rgba(217,119,6,0.5), inset 0 1px 1px rgba(255,255,255,0.2)",
            border: "1.5px solid #f59e0b",
            fontSize: 16,
          }}
        >
          🏛
        </div>
        <div>
          <div
            style={{
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              color: "#f0c040",
              letterSpacing: "0.06em",
              textShadow: "0 0 12px rgba(240,192,64,0.5)",
            }}
          >
            City of Ranpur
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="px-1.5 py-0 rounded"
              style={{
                fontSize: 9,
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: "#e8a030",
                background: "rgba(232,160,48,0.12)",
                border: "1px solid rgba(232,160,48,0.25)",
              }}
            >
              TERM 2
            </span>
            <ChevronRight size={9} color="#4b6280" />
            <span className="text-gray-500" style={{ fontSize: 10, fontFamily: "'Share Tech Mono', monospace" }}>
              Turn 4 / 30
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-8 w-px" style={{ background: "#1c3652" }} />

      {/* Budget section */}
      <div className="flex-1 max-w-md">
        <div className="flex items-center justify-between mb-1">
          <span
            style={{
              fontSize: 9,
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.2em",
              color: "#4b6280",
            }}
          >
            BUDGET
          </span>
          <span
            style={{
              fontSize: 9,
              fontFamily: "'Rajdhani', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "#4b6280",
            }}
          >
            FISCAL YEAR 2026
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Spent */}
          <div className="flex items-center gap-1 shrink-0">
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", fontFamily: "'Share Tech Mono', monospace" }}>
              ₹{spent.toLocaleString()} Cr
            </span>
            <span className="text-gray-600" style={{ fontSize: 9 }}>Spent</span>
          </div>
          {/* Bar */}
          <div
            className="flex-1 rounded-full overflow-hidden"
            style={{ height: 6, background: "#071018" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${spentPct}%`,
                background: "linear-gradient(90deg, #dc2626, #f59e0b)",
                boxShadow: "0 0 6px rgba(245,158,11,0.5)",
                transition: "width 0.5s ease",
              }}
            />
          </div>
          {/* Remaining */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-gray-600" style={{ fontSize: 9 }}>Left</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80", fontFamily: "'Share Tech Mono', monospace" }}>
              ₹{remaining.toLocaleString()} Cr
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-8 w-px" style={{ background: "#1c3652" }} />

      {/* Mayor Approval */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{ width: 38, height: 38 }}
        >
          <svg viewBox="0 0 38 38" width="38" height="38" style={{ position: "absolute", top: 0, left: 0 }}>
            <circle cx="19" cy="19" r="16" fill="none" stroke="#0a1a30" strokeWidth="4" />
            <circle
              cx="19" cy="19" r="16" fill="none"
              stroke="#22c55e"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(61 / 100) * (2 * Math.PI * 16)} ${2 * Math.PI * 16}`}
              transform="rotate(-90 19 19)"
              style={{ filter: "drop-shadow(0 0 4px #16a34a)" }}
            />
          </svg>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#4ade80", fontFamily: "'Share Tech Mono', monospace", position: "relative", zIndex: 1 }}>
            61%
          </span>
        </div>
        <div>
          <div
            style={{
              fontSize: 9,
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: "0.15em",
              color: "#4b6280",
              fontWeight: 700,
            }}
          >
            MAYOR APPROVAL
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span style={{ fontSize: 18, fontWeight: 700, color: "#f0c040", fontFamily: "'Share Tech Mono', monospace", lineHeight: 1 }}>
              61%
            </span>
            <span
              className="flex items-center gap-0.5"
              style={{ fontSize: 10, fontWeight: 700, color: "#4ade80" }}
            >
              ▲ +5.2%
            </span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-8 w-px" style={{ background: "#1c3652" }} />

      {/* Icon buttons + Next Turn */}
      <div className="flex items-center gap-2 ml-auto shrink-0">
        {[
          { Icon: Clock, label: "History" },
          { Icon: HelpCircle, label: "Help" },
          { Icon: Settings, label: "Settings" },
        ].map(({ Icon, label }) => (
          <button
            key={label}
            className="flex items-center justify-center rounded transition-all"
            title={label}
            style={{
              width: 30,
              height: 30,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid #1c3652",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#e8a030";
              e.currentTarget.style.background = "rgba(232,160,48,0.1)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "#1c3652";
              e.currentTarget.style.background = "rgba(255,255,255,0.04)";
            }}
          >
            <Icon size={13} color="#4b6280" />
          </button>
        ))}

        <button
          className="flex items-center gap-2 rounded font-bold transition-all"
          style={{
            background: "linear-gradient(135deg, #c47d10, #e8a030, #c47d10)",
            padding: "7px 14px",
            fontSize: 12,
            color: "#040d1b",
            fontFamily: "'Rajdhani', sans-serif",
            letterSpacing: "0.1em",
            fontWeight: 700,
            boxShadow: "0 0 16px rgba(232,160,48,0.4), inset 0 1px 1px rgba(255,255,255,0.3)",
            border: "1px solid rgba(255,200,60,0.4)",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 24px rgba(232,160,48,0.6), inset 0 1px 1px rgba(255,255,255,0.3)")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 0 16px rgba(232,160,48,0.4), inset 0 1px 1px rgba(255,255,255,0.3)")}
        >
          <SkipForward size={13} />
          NEXT TURN
        </button>
      </div>
    </div>
  );
}
