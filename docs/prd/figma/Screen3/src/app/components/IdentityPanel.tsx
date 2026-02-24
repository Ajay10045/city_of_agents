import { Newspaper, MessageCircle, TrendingUp, TrendingDown } from "lucide-react";

const CHAT_IMG1 = "https://images.unsplash.com/photo-1737574821698-862e77f044c1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=80";
const CHAT_IMG2 = "https://images.unsplash.com/photo-1759851684060-12de28b30979?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=80";

type IdentityGroup = {
  name: string;
  approval: number;
  influence: number;
  approvalColor: string;
  influenceColor: string;
  icon: string;
  special?: string;
  approvalUp?: boolean;
  influenceUp?: boolean;
};

const identityGroups: IdentityGroup[] = [
  { name: "Hinduism", approval: 23, influence: 58, approvalColor: "#22c55e", influenceColor: "#a855f7", icon: "🕉", approvalUp: false, influenceUp: true },
  { name: "Working Class", approval: 55, influence: 13, approvalColor: "#22c55e", influenceColor: "#f97316", icon: "⚙", approvalUp: true, influenceUp: false },
  { name: "Middle Class", approval: 45, influence: 13, approvalColor: "#eab308", influenceColor: "#eab308", icon: "🏘", approvalUp: false, influenceUp: false },
  { name: "Business Sector", approval: 53, influence: 57, approvalColor: "#22c55e", influenceColor: "#22c55e", icon: "💼", approvalUp: true, influenceUp: true },
  { name: "Civil Society", approval: 52, influence: 52, approvalColor: "#38bdf8", influenceColor: "#38bdf8", icon: "⬡", special: "blue", approvalUp: true, influenceUp: true },
  { name: "Conservative", approval: 53, influence: 45, approvalColor: "#22c55e", influenceColor: "#f87171", icon: "★", special: "red", approvalUp: true, influenceUp: false },
];

type MediaItem = {
  outlet: string;
  badge?: string;
  headline: string;
  time?: string;
  initials: string;
  color: string;
  accentColor: string;
  hasChat?: boolean;
};

const mediaItems: MediaItem[] = [
  {
    outlet: "The Power Times",
    badge: "Deputy District · RV",
    headline: "Metro expansion a clear priority, crossing into dangerous territory.",
    time: "13:30",
    initials: "TP",
    color: "#991b1b",
    accentColor: "#f87171",
  },
  {
    outlet: "Fern Examiner",
    headline: "Costing broadly, a record order with minor concerns. Full finance report incoming.",
    time: "13:46",
    initials: "FE",
    color: "#1e40af",
    accentColor: "#60a5fa",
  },
  {
    outlet: "City Renewal",
    badge: "Temporal",
    headline: "Social commentary on construction. Warning: housing congestion rising sharply.",
    initials: "CR",
    color: "#065f46",
    accentColor: "#34d399",
    hasChat: true,
  },
];

const cityChatter = [
  {
    user: "Metro_Watch",
    handle: "@wer_breath",
    text: "Days of monstrous traffic proposals — our city altitude during this commotion.",
    time: "12:33",
    img: CHAT_IMG1,
    ring: "#3b82f6",
  },
  {
    user: "France_Report",
    handle: "@france_announce",
    text: "Roads are getting better. Hoping the pledges intensify things further.",
    time: "12:33",
    img: null,
    initials: "FR",
    ring: "#ec4899",
    color: "#be185d",
  },
  {
    user: "Wirta Sapath",
    handle: "@wirta_s",
    text: "Controlling corruption is critical (high priority). Salt Farm developments progressing.",
    time: "13:59",
    img: CHAT_IMG2,
    ring: "#14b8a6",
  },
];

function MiniBar({ value, color, width = 44 }: { value: number; color: string; width?: number }) {
  return (
    <div
      style={{
        width,
        height: 4,
        background: "rgba(10,26,48,0.8)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
          background: color,
          borderRadius: 2,
          boxShadow: `0 0 4px ${color}80`,
        }}
      />
    </div>
  );
}

const panelStyle = {
  background: "linear-gradient(180deg, #0b1929 0%, #091422 100%)",
  border: "1px solid #1c3652",
  borderRadius: 6,
};

function PanelHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ borderBottom: "1px solid #1c3652" }}
    >
      <Icon size={11} color="#e8a030" />
      <span
        style={{
          fontFamily: "'Rajdhani', sans-serif",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: "0.15em",
          color: "#e8a030",
        }}
      >
        {title}
      </span>
    </div>
  );
}

export function IdentityPanel() {
  return (
    <div className="w-[280px] flex flex-col gap-2 shrink-0">
      {/* Identity Groups */}
      <div style={panelStyle} className="shrink-0">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid #1c3652" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full" style={{ background: "#a855f7", boxShadow: "0 0 6px #a855f7" }} />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", color: "#e8a030" }}>
              IDENTITY GROUPS
            </span>
          </div>
          <span className="text-gray-500" style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif", letterSpacing: "0.08em" }}>
            APPROVAL · INFLUENCE
          </span>
        </div>
        <div className="px-2 py-1.5 space-y-0.5">
          {identityGroups.map((group) => (
            <div
              key={group.name}
              className="flex items-center gap-2 px-1.5 py-1.5 rounded cursor-pointer transition-all"
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}
            >
              {/* Icon */}
              <span
                style={{
                  fontSize: 11,
                  color: group.special === "blue" ? "#38bdf8" : group.special === "red" ? "#f87171" : "#94a3b8",
                  width: 14,
                  textAlign: "center",
                }}
              >
                {group.icon}
              </span>
              {/* Name */}
              <span className="flex-1 text-gray-300 truncate" style={{ fontSize: 11 }}>
                {group.name}
              </span>
              {/* Approval bar + number */}
              <div className="flex items-center gap-1 shrink-0">
                <MiniBar value={group.approval} color={group.approvalColor} width={36} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: group.approvalColor,
                    fontFamily: "'Share Tech Mono', monospace",
                    width: 20,
                    textAlign: "right",
                  }}
                >
                  {group.approval}
                </span>
              </div>
              <div
                className="w-px h-3"
                style={{ background: "#1c3652" }}
              />
              {/* Influence bar + number */}
              <div className="flex items-center gap-1 shrink-0">
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: group.influenceColor,
                    fontFamily: "'Share Tech Mono', monospace",
                    width: 20,
                    textAlign: "left",
                  }}
                >
                  {group.influence}
                </span>
                <MiniBar value={group.influence} color={group.influenceColor} width={36} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Media */}
      <div style={panelStyle} className="shrink-0">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid #1c3652" }}
        >
          <div className="flex items-center gap-2">
            <Newspaper size={11} color="#e8a030" />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", color: "#e8a030" }}>
              MEDIA
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={10} color="#22c55e" />
            <span className="text-gray-500" style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif" }}>Campaign Rate</span>
          </div>
        </div>
        <div className="p-2 space-y-2">
          {mediaItems.map((item, i) => (
            <div
              key={i}
              className="flex gap-2 p-1.5 rounded cursor-pointer transition-all"
              style={{ background: "rgba(255,255,255,0.02)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            >
              {/* Outlet logo */}
              <div
                className="shrink-0 rounded flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  background: item.color,
                  border: `1px solid ${item.accentColor}44`,
                  fontSize: 9,
                  fontWeight: 700,
                  color: item.accentColor,
                  fontFamily: "'Rajdhani', sans-serif",
                  letterSpacing: "0.05em",
                  boxShadow: `0 0 8px ${item.color}88`,
                }}
              >
                {item.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span style={{ fontSize: 10, fontWeight: 700, color: item.accentColor }}>{item.outlet}</span>
                  {item.badge && (
                    <span
                      className="px-1 py-0 rounded"
                      style={{ fontSize: 8, color: "#64748b", background: "rgba(255,255,255,0.05)", border: "1px solid #1e3a5f" }}
                    >
                      {item.badge}
                    </span>
                  )}
                  {item.time && <span className="text-gray-600 ml-auto" style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace" }}>{item.time}</span>}
                  {item.hasChat && (
                    <button
                      className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded transition-all"
                      style={{ background: "rgba(232,160,48,0.1)", border: "1px solid rgba(232,160,48,0.3)", fontSize: 9, color: "#e8a030" }}
                    >
                      Chat <span style={{ fontSize: 8 }}>→</span>
                    </button>
                  )}
                </div>
                <div className="text-gray-400 mt-0.5" style={{ fontSize: 10, lineHeight: 1.45 }}>{item.headline}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-2 pb-2">
          <button
            className="w-full py-1.5 rounded transition-all"
            style={{
              border: "1px solid #1c3652",
              fontSize: 10,
              color: "#4b6280",
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: "0.1em",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "#e8a030";
              e.currentTarget.style.color = "#e8a030";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "#1c3652";
              e.currentTarget.style.color = "#4b6280";
            }}
          >
            VIEW ALL MEDIA
          </button>
        </div>
      </div>

      {/* City Chatter */}
      <div style={panelStyle} className="flex-1 overflow-hidden flex flex-col">
        <div
          className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{ borderBottom: "1px solid #1c3652" }}
        >
          <div className="flex items-center gap-2">
            <MessageCircle size={11} color="#e8a030" />
            <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: "0.15em", color: "#e8a030" }}>
              CITY CHATTER
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown size={10} color="#f87171" />
            <span className="text-gray-500" style={{ fontSize: 9, fontFamily: "'Rajdhani', sans-serif" }}>Well-being ▼</span>
          </div>
        </div>
        <div className="p-2 space-y-2.5 overflow-y-auto flex-1">
          {cityChatter.map((item, i) => (
            <div key={i} className="flex gap-2">
              {/* Avatar */}
              <div className="shrink-0" style={{ position: "relative", width: 30, height: 30 }}>
                {item.img ? (
                  <img
                    src={item.img}
                    alt={item.user}
                    className="rounded-full object-cover"
                    style={{ width: 30, height: 30, border: `1.5px solid ${item.ring}` }}
                  />
                ) : (
                  <div
                    className="rounded-full flex items-center justify-center text-white"
                    style={{
                      width: 30, height: 30,
                      background: (item as any).color || item.ring,
                      border: `1.5px solid ${item.ring}`,
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  >
                    {(item as any).initials || item.user.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div
                  className="absolute bottom-0 right-0 rounded-full"
                  style={{ width: 7, height: 7, background: "#22c55e", border: "1px solid #050d1b", boxShadow: "0 0 4px #22c55e" }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7dd3fc" }}>{item.user}</span>
                  <span className="text-gray-600" style={{ fontSize: 9 }}>{item.handle}</span>
                  <span className="text-gray-600 ml-auto" style={{ fontSize: 9, fontFamily: "'Share Tech Mono', monospace" }}>{item.time}</span>
                </div>
                <div
                  className="mt-1 px-2 py-1.5 rounded"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(28,54,82,0.6)",
                    fontSize: 10,
                    color: "#94a3b8",
                    lineHeight: 1.5,
                  }}
                >
                  {item.text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
