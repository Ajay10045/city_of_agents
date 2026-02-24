import { useState } from "react";
import { Send, AlertTriangle, Zap, Droplets, TrendingDown, ChevronRight } from "lucide-react";

const PRIYA_IMG = "https://images.unsplash.com/photo-1544264796-acfb69e05b37?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200";
const RAJESH_IMG = "https://images.unsplash.com/photo-1564498325-c88d3290d273?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200";
const SAJID_IMG = "https://images.unsplash.com/photo-1721713478248-ded19734143d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=200";

const advisors = [
  { name: "Priya Sharma", role: "Finance Minister", loyalty: 52, barColor: "#f59e0b", img: PRIYA_IMG, ring: "#7c3aed" },
  { name: "Rajesh Deshmukh", role: "Deputy Mayor", loyalty: 62, barColor: "#22c55e", img: RAJESH_IMG, ring: "#2563eb" },
  { name: "Sajid Khan", role: "Water & Power", loyalty: 48, barColor: "#f97316", img: SAJID_IMG, ring: "#0d9488" },
];

const chatMessages = [
  {
    sender: "Mayor",
    senderRole: "",
    text: "We're facing severe traffic congestion in Sabarmati. What's your priority?",
    time: "3:42 PM",
    isMayor: true,
    img: null,
    initials: "M",
    ringColor: "#d97706",
  },
  {
    sender: "Priya Sharma",
    senderRole: "Finance Minister",
    text: "Focus on congestion relief first. Metro expansion and flyover will reduce gridlock.",
    time: "3:43 PM",
    isMayor: false,
    img: PRIYA_IMG,
    initials: "PS",
    ringColor: "#7c3aed",
  },
  {
    sender: "Rajesh Deshmukh",
    senderRole: "Deputy Mayor",
    text: "I support this. It will also create jobs and boost the local economy.",
    time: "3:45 PM",
    isMayor: false,
    img: RAJESH_IMG,
    initials: "RD",
    ringColor: "#2563eb",
    hasIndicator: true,
  },
  {
    sender: "Sajid Khan",
    senderRole: "Water & Power",
    text: "Ensure water supply isn't neglected during construction phases.",
    time: "3:45 PM",
    isMayor: false,
    img: SAJID_IMG,
    initials: "SK",
    ringColor: "#0d9488",
  },
];

const crises = [
  {
    name: "Traffic Congestion",
    location: "Sabarmati",
    severity: "HIGH",
    risk: "21% Risk",
    severityBg: "rgba(239,68,68,0.15)",
    severityBorder: "#7f1d1d",
    severityText: "#f87171",
    dot: "#f87171",
    Icon: AlertTriangle,
    iconColor: "#f87171",
  },
  {
    name: "Economic Downturn",
    location: "Next Turn",
    severity: "MEDIUM",
    risk: "35% Risk",
    severityBg: "rgba(249,115,22,0.15)",
    severityBorder: "#7c2d12",
    severityText: "#fb923c",
    dot: "#fb923c",
    Icon: TrendingDown,
    iconColor: "#fb923c",
  },
  {
    name: "Water Shortage",
    location: "",
    severity: "LOW",
    risk: "",
    severityBg: "rgba(34,197,94,0.1)",
    severityBorder: "#14532d",
    severityText: "#4ade80",
    dot: "#4ade80",
    Icon: Droplets,
    iconColor: "#4ade80",
  },
];

function LoyaltyArc({ value, color }: { value: number; color: string }) {
  const r = 13;
  const circ = 2 * Math.PI * r;
  const fill = (value / 100) * circ;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34">
      <circle cx="17" cy="17" r={r} fill="none" stroke="#0a1a30" strokeWidth="4" />
      <circle
        cx="17" cy="17" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${fill} ${circ}`}
        transform="rotate(-90 17 17)"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
      <text x="17" y="21" textAnchor="middle" fill="white" fontSize="8" fontWeight="700" fontFamily="Share Tech Mono">{value}</text>
    </svg>
  );
}

export function AdvisoryChat() {
  const [message, setMessage] = useState("");

  return (
    <div className="w-[280px] flex flex-col gap-2 shrink-0">
      {/* Advisory Chat Panel */}
      <div
        className="flex flex-col flex-1 overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0b1929 0%, #091422 100%)",
          border: "1px solid #1c3652",
          borderRadius: 6,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid #1c3652", background: "rgba(255,255,255,0.02)" }}
        >
          <div className="flex items-center gap-2">
            <Zap size={12} className="text-amber-400" />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", color: "#e8a030" }}>
              SC ADVISORY CHAT
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: "0 0 6px #22c55e" }} />
            <span className="text-green-400" style={{ fontSize: 10 }}>Online</span>
          </div>
        </div>

        {/* Advisors */}
        <div style={{ borderBottom: "1px solid #1c3652" }}>
          {advisors.map((advisor) => (
            <div
              key={advisor.name}
              className="flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors"
              style={{ borderBottom: "1px solid rgba(28,54,82,0.5)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              <div
                className="shrink-0 relative"
                style={{ width: 34, height: 34 }}
              >
                <img
                  src={advisor.img}
                  alt={advisor.name}
                  className="rounded-full object-cover"
                  style={{
                    width: 28, height: 28,
                    position: "absolute", top: 3, left: 3,
                    border: `1.5px solid ${advisor.ring}`,
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white truncate" style={{ fontSize: 11, fontWeight: 600 }}>{advisor.name}</div>
                <div className="text-gray-500 truncate" style={{ fontSize: 10 }}>{advisor.role}</div>
              </div>
              <div className="shrink-0 flex flex-col items-center gap-0.5">
                <LoyaltyArc value={advisor.loyalty} color={advisor.barColor} />
                <span className="text-gray-500" style={{ fontSize: 9, letterSpacing: "0.05em" }}>LOYALTY</span>
              </div>
            </div>
          ))}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2.5 min-h-0" style={{ maxHeight: 210 }}>
          {chatMessages.map((msg, i) => (
            <div key={i} className="flex gap-2">
              <div className="shrink-0 mt-0.5" style={{ position: "relative", width: 26, height: 26 }}>
                {msg.img ? (
                  <img
                    src={msg.img} alt={msg.sender}
                    className="rounded-full object-cover"
                    style={{ width: 26, height: 26, border: `1.5px solid ${msg.ringColor}` }}
                  />
                ) : (
                  <div
                    className="rounded-full flex items-center justify-center text-white"
                    style={{
                      width: 26, height: 26,
                      background: `linear-gradient(135deg, ${msg.ringColor}, ${msg.ringColor}88)`,
                      fontSize: 9, fontWeight: 700,
                      border: `1.5px solid ${msg.ringColor}`,
                    }}
                  >
                    {msg.initials}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 10, fontWeight: 700, color: msg.isMayor ? "#e8a030" : "#7dd3fc" }}>{msg.sender}</span>
                  {msg.senderRole && <span className="text-gray-600" style={{ fontSize: 10 }}>· {msg.senderRole}</span>}
                  <span className="ml-auto text-gray-600" style={{ fontSize: 9 }}>{msg.time}</span>
                </div>
                <div
                  className="mt-1 px-2 py-1.5 rounded-lg"
                  style={{
                    fontSize: 11,
                    color: "#c0cfe0",
                    background: msg.isMayor ? "rgba(216,160,48,0.1)" : "rgba(255,255,255,0.05)",
                    borderLeft: `2px solid ${msg.ringColor}44`,
                    lineHeight: 1.5,
                  }}
                >
                  {msg.text}
                </div>
                {msg.hasIndicator && (
                  <div className="flex gap-1 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-0.5" style={{ boxShadow: "0 0 4px #60a5fa" }} />
                    <span className="text-blue-400 italic" style={{ fontSize: 9 }}>Typing...</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="px-2 py-2 flex gap-1.5" style={{ borderTop: "1px solid #1c3652" }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 text-white placeholder-gray-600 focus:outline-none"
            style={{
              background: "#071018",
              border: "1px solid #1c3652",
              borderRadius: 4,
              padding: "5px 8px",
              fontSize: 11,
            }}
            onFocus={e => (e.target.style.borderColor = "#e8a030")}
            onBlur={e => (e.target.style.borderColor = "#1c3652")}
          />
          <button
            className="shrink-0 flex items-center justify-center transition-all"
            style={{
              background: "linear-gradient(135deg, #c47d10, #e8a030)",
              borderRadius: 4,
              width: 30,
              height: 30,
              boxShadow: "0 0 8px rgba(232,160,48,0.4)",
            }}
            title="Send"
          >
            <Send size={13} color="white" />
          </button>
          <button
            className="shrink-0 text-xs px-2 transition-all"
            style={{
              background: "rgba(59,130,246,0.15)",
              border: "1px solid #1e40af",
              borderRadius: 4,
              color: "#60a5fa",
              fontSize: 10,
              fontWeight: 600,
              whiteSpace: "nowrap",
              fontFamily: "'Rajdhani', sans-serif",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(59,130,246,0.25)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(59,130,246,0.15)")}
          >
            Draft Policy
          </button>
        </div>
      </div>

      {/* Active Crises */}
      <div
        className="shrink-0"
        style={{
          background: "linear-gradient(180deg, #0b1929 0%, #091422 100%)",
          border: "1px solid #1c3652",
          borderRadius: 6,
        }}
      >
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid #1c3652" }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={11} color="#e8a030" />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", color: "#e8a030" }}>
              ACTIVE CRISES
            </span>
          </div>
          <ChevronRight size={14} color="#4b6280" />
        </div>
        <div className="p-2 space-y-1.5">
          {crises.map((crisis) => (
            <div
              key={crisis.name}
              className="flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-all"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(28,54,82,0.6)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
            >
              <crisis.Icon size={14} color={crisis.iconColor} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-white truncate" style={{ fontSize: 11, fontWeight: 600 }}>{crisis.name}</div>
                {crisis.location && (
                  <div className="text-gray-500" style={{ fontSize: 10 }}>
                    {crisis.location}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: "0.08em",
                    color: crisis.severityText,
                    background: crisis.severityBg,
                    border: `1px solid ${crisis.severityBorder}`,
                  }}
                >
                  {crisis.severity}
                </span>
                {crisis.risk && <span className="text-gray-500" style={{ fontSize: 10 }}>{crisis.risk}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
