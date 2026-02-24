import React from 'react';
import { Send, Plus, ChevronRight, AlertTriangle, Droplets, TrendingDown, Car, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils'; // Assuming cn exists or I'll implement it inline

const advisors = [
  {
    name: 'Priya Sharma',
    role: 'Finance Minister',
    loyalty: 52,
    image: 'https://images.unsplash.com/photo-1583590019912-19cdc55ec80e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmRpYW4lMjBwcm9mZXNzaW9uYWwlMjB3b21hbiUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MTkxNzE0N3ww&ixlib=rb-4.1.0&q=80&w=1080',
    status: 'online',
    isTyping: true,
  },
  {
    name: 'Rajesh Deshmukh',
    role: 'Deputy Mayor',
    loyalty: 62,
    image: 'https://images.unsplash.com/photo-1649433658557-54cf58577c68?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmRpYW4lMjBwcm9mZXNzaW9uYWwlMjBtYW4lMjBwb3J0cmFpdHxlbnwxfHx8fDE3NzE4NTEwMjh8MA&ixlib=rb-4.1.0&q=80&w=1080',
    status: 'online',
    isTyping: false,
  },
  {
    name: 'Sajid Khan',
    role: 'Water & Power',
    loyalty: 48,
    image: 'https://images.unsplash.com/photo-1762885590704-cbe990f95ca5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvbGRlciUyMGluZGlhbiUyMHByb2Zlc3Npb25hbCUyMG1hbiUyMHBvcnRyYWl0fGVufDF8fHx8MTc3MTkxNzE1Nnww&ixlib=rb-4.1.0&q=80&w=1080',
    status: 'idle',
    isTyping: false,
  },
];

const messages = [
  {
    id: 1,
    sender: 'Mayor',
    text: "We're facing severe traffic congestion in Sabarmati. What's your priority?",
    time: '3:42 PM',
    isMe: true,
  },
  {
    id: 2,
    sender: 'Priya Sharma',
    role: 'Finance Minister',
    text: 'Focus on congestion relief first. Metro expansion and flyover will reduce gridlock.',
    time: '3:43 PM',
    isMe: false,
    avatar: advisors[0].image
  },
  {
    id: 3,
    sender: 'Rajesh Deshmukh',
    role: 'Deputy Mayor',
    text: 'I support this. It will also create jobs.',
    time: '3:45 PM',
    isMe: false,
    avatar: advisors[1].image
  },
  {
    id: 4,
    sender: 'Sajid Khan',
    role: 'Water & Power',
    text: "Ensure water supply isn't neglected during construction.",
    time: '3:45 PM',
    isMe: false,
    avatar: advisors[2].image
  },
];

const activeCrises = [
  {
    id: 1,
    name: 'Traffic Congestion',
    severity: 'HIGH',
    risk: '21% Risk',
    details: 'Sabarmati',
    icon: Car,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20'
  },
  {
    id: 2,
    name: 'Economic Downturn',
    severity: 'MEDIUM',
    risk: '35% Risk',
    details: 'Next Turn',
    icon: TrendingDown,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/20'
  },
  {
    id: 3,
    name: 'Water Shortage',
    severity: 'LOW',
    risk: '',
    details: 'Citywide',
    icon: Droplets,
    color: 'text-sky-500',
    bgColor: 'bg-sky-500/10',
    borderColor: 'border-sky-500/20'
  },
];

export const LeftSidebar = () => {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Advisors Section */}
      <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden flex flex-col h-[65%]">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-[#0f172a]">
          <h2 className="text-amber-400 font-bold tracking-wider text-sm">SC ADVISORY CHAT</h2>
          <span className="text-emerald-400 text-xs flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Online
          </span>
        </div>
        
        {/* Advisor List */}
        <div className="flex flex-col gap-1 p-2 bg-[#0f172a]/50">
          {advisors.map((advisor, idx) => (
            <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer group">
              <div className="relative">
                <img src={advisor.image} alt={advisor.name} className="w-10 h-10 rounded-full object-cover border-2 border-slate-600 group-hover:border-amber-400 transition-colors" />
                {advisor.status === 'online' && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#1e293b] rounded-full"></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-200 truncate">{advisor.name}</h3>
                  <div className="text-xs text-slate-400 flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-wider">Loyalty</span>
                    <span className={`font-bold ${advisor.loyalty < 50 ? 'text-red-400' : 'text-amber-400'}`}>{advisor.loyalty}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 truncate">{advisor.role}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0f172a]/30 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
               {!msg.isMe && (
                 <img src={msg.avatar} className="w-8 h-8 rounded-full object-cover mt-1" />
               )}
               <div className={`flex flex-col max-w-[85%] ${msg.isMe ? 'items-end' : 'items-start'}`}>
                 {!msg.isMe && (
                   <span className="text-xs text-slate-400 mb-1 flex gap-2">
                     <span className="font-bold text-slate-200">{msg.sender}</span>
                     <span>{msg.role}</span>
                   </span>
                 )}
                 {msg.isMe && (
                    <span className="text-xs text-amber-400 mb-1 font-bold">Mayor</span>
                 )}
                 <div className={`p-3 rounded-xl text-sm ${
                   msg.isMe 
                     ? 'bg-slate-700 text-slate-100 rounded-tr-none' 
                     : 'bg-[#1e293b] border border-slate-700 text-slate-200 rounded-tl-none'
                 }`}>
                   {msg.text}
                 </div>
                 <span className="text-[10px] text-slate-500 mt-1">{msg.time}</span>
               </div>
            </div>
          ))}
          {/* Typing Indicator */}
          <div className="flex items-center gap-2 text-xs text-slate-400 pl-12 animate-pulse">
            <Loader2 size={12} className="animate-spin" />
            Priya Sharma is typing...
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 bg-[#0f172a] border-t border-slate-700">
          <div className="flex gap-2 mb-2">
             <input 
               type="text" 
               placeholder="Type your message..." 
               className="flex-1 bg-slate-800 border-none rounded-lg px-4 py-2 text-sm text-slate-200 focus:ring-1 focus:ring-amber-500 outline-none placeholder:text-slate-500"
             />
          </div>
          <div className="flex justify-between items-center">
             <button className="text-slate-400 hover:text-slate-200 p-1">
               <Plus size={18} />
             </button>
             <button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs px-3 py-1.5 rounded-md transition-colors">
               Draft Policy
             </button>
          </div>
        </div>
      </div>

      {/* Active Crises */}
      <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden flex-1 flex flex-col">
        <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-[#0f172a]">
          <h2 className="text-amber-400 font-bold tracking-wider text-sm uppercase">Active Crises</h2>
          <button className="text-slate-400 hover:text-white">
            <span className="sr-only">Close</span>
            ×
          </button>
        </div>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto">
          {activeCrises.map((crisis) => (
            <div key={crisis.id} className={`p-3 rounded-lg border flex items-center gap-3 ${crisis.bgColor} ${crisis.borderColor}`}>
              <div className={`p-2 rounded-full bg-slate-900/50 ${crisis.color}`}>
                <crisis.icon size={18} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                   <h3 className="text-sm font-bold text-slate-200">{crisis.name}</h3>
                   {crisis.risk && (
                     <span className="text-xs font-bold text-slate-400 flex items-center gap-1 border-l border-slate-600 pl-2 ml-2">
                       {crisis.risk}
                     </span>
                   )}
                </div>
                <div className="flex justify-between items-center mt-1">
                   <span className="text-xs text-slate-400">{crisis.details}</span>
                   <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                     crisis.severity === 'HIGH' ? 'text-red-400 border-red-400/30 bg-red-400/10' :
                     crisis.severity === 'MEDIUM' ? 'text-amber-400 border-amber-400/30 bg-amber-400/10' :
                     'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
                   }`}>
                     {crisis.severity}
                   </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
