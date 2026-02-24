import "../styles/fonts.css";
import { TopBar } from "./components/TopBar";
import { AdvisoryChat } from "./components/AdvisoryChat";
import { WelfarePanel } from "./components/WelfarePanel";
import { IdentityPanel } from "./components/IdentityPanel";

export default function App() {
  return (
    <div
      className="min-h-screen bg-[#050d1b] text-white flex flex-col overflow-hidden"
      style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
    >
      <TopBar />
      <div className="flex flex-1 gap-2 p-2 overflow-hidden min-h-0">
        <AdvisoryChat />
        <WelfarePanel />
        <IdentityPanel />
      </div>
    </div>
  );
}
