import { Bell, HelpCircle, Settings, ChevronDown, RefreshCw } from "lucide-react";

export function Header() {
  return (
    <header className="flex items-center justify-between bg-slate-900 border-b border-slate-800 p-4 h-16 text-white shrink-0">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center overflow-hidden">
          <img 
            src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=100&h=100" 
            alt="City Icon" 
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight">City of Ranpur</h1>
          <p className="text-xs text-slate-400">Term 2 · Turn 4/30</p>
        </div>
      </div>

      {/* Center: Budget */}
      <div className="flex-1 max-w-2xl mx-8">
        <div className="flex justify-between text-xs font-semibold mb-1 uppercase tracking-wider">
          <span className="text-amber-400">Budget</span>
          <div className="flex gap-4">
            <span className="text-amber-400">₹7,600 Cr Spent</span>
            <span className="text-blue-400">₹2,400 Cr Remaining</span>
          </div>
        </div>
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-amber-500 w-[76%] relative group">
             <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/20"></div>
          </div>
          <div className="h-full bg-blue-600 w-[24%]"></div>
        </div>
      </div>

      {/* Right: Approval & Actions */}
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Mayor Approval</div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-2xl font-bold text-amber-400">61%</span>
            <span className="text-sm text-green-400 font-medium">+5.2%</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-lg border border-slate-700">
           <button className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
             <Bell size={18} />
           </button>
           <button className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
             <HelpCircle size={18} />
           </button>
           <button className="p-2 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
             <Settings size={18} />
           </button>
        </div>

        <button className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-slate-900 px-5 py-2 rounded-lg font-bold transition-colors">
          <RefreshCw size={18} className="rotate-90" />
          Next Turn
        </button>
      </div>
    </header>
  );
}
