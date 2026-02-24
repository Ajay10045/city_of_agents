import * as React from 'react';
import { Button } from './ui/button';
import { Send, ChevronRight } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';

interface Message {
  id: string;
  sender: string;
  role: string;
  message: string;
  time: string;
  action?: string;
  avatar: string;
}

export function AdvisoryChat() {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      id: '1',
      sender: 'Priya Sharma',
      role: 'Finance Minister',
      message: 'Fielded Colombia (Finance Minister): that inan mahoy que exction servero ciolar and expand cia sinality.',
      time: '3:14 AM',
      avatar: 'https://images.unsplash.com/photo-1629145185593-5339038e644f?w=100&h=100&fit=crop'
    },
    {
      id: '2',
      sender: 'Priya Sharma',
      role: 'Deputy Minister',
      message: 'Finance Minister (Deputy Minister): Fools and flan oun gunoestion be hasmakul district, engapoe r micro capacity. Invasion.',
      time: '3:04 AM',
      action: 'al finasse Paraindinn',
      avatar: 'https://images.unsplash.com/photo-1689600944138-da3b150d9cb8?w=100&h=100&fit=crop'
    },
    {
      id: '3',
      sender: 'Rajesh Deshmukh',
      role: '',
      message: 'Will spaeds yor unit permanongly ast the clori phorel gonce piodr co cussicity.',
      time: '3:09 AM',
      avatar: 'https://images.unsplash.com/photo-1700616466971-a4e05aa89e7d?w=100&h=100&fit=crop'
    }
  ]);

  const [inputValue, setInputValue] = React.useState('');

  const welfareIndicators = [
    { label: 'Sajd imast', value: 9.5, max: 10, color: 'bg-cyan-500' },
    { label: 'Regionl tools', value: 27.5, max: 30, color: 'bg-blue-500' },
    { label: 'Tantion mpur', value: 11.0, max: 15, color: 'bg-amber-500' },
    { label: 'Education', value: 24.4, max: 30, color: 'bg-amber-600' },
    { label: 'Commerce', value: 4.5, max: 10, color: 'bg-gray-500' },
    { label: 'Policde Safety', value: 6.5, max: 10, color: 'bg-amber-500' },
    { label: 'Juquitany', value: 6.6, max: 10, color: 'bg-red-500' }
  ];

  const identityGroups = [
    { label: 'Middle Class', value: -47, color: 'bg-cyan-500' },
    { label: 'Working Class', value: -175, color: 'bg-amber-500' },
    { label: 'Murail di Roopr', value: -275, color: 'bg-orange-500' },
    { label: 'Hetchnard', value: 264, color: 'bg-cyan-400' },
    { label: 'Secaution', value: 495, color: 'bg-blue-500' },
    { label: 'Communtics', value: 207, color: 'bg-amber-500' },
    { label: 'Firenze tricey', value: 496, color: 'bg-amber-600' },
    { label: 'Accompiny', value: 464, color: 'bg-amber-500' },
    { label: 'Aleira Quilment', value: 295, color: 'bg-orange-500' }
  ];

  const cityParameters = [
    { label: 'Economy', value: 2 },
    { label: 'Jobs of Disposhe', value: 2 },
    { label: 'Wruster Power', value: 5 },
    { label: 'Tagpslen toast', value: 10 },
    { label: 'Transit st Reabies', value: 9 },
    { label: 'Seure remaining', value: 5 }
  ];

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      setMessages([
        ...messages,
        {
          id: Date.now().toString(),
          sender: 'You',
          role: 'Player',
          message: inputValue,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop'
        }
      ]);
      setInputValue('');
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1f3a] text-white p-6">
      <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-6">
        {/* Left Sidebar - Chat */}
        <div className="col-span-4 bg-[#232847] rounded-lg border border-gray-700 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-amber-400 text-sm font-medium tracking-wide">SC ADVISORY CHAT</h2>
            <Badge className="bg-gray-700 text-white text-xs px-2 py-1">5X</Badge>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="flex gap-3">
                <ImageWithFallback
                  src={message.avatar}
                  alt={message.sender}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{message.sender}</span>
                    <span className="text-xs text-gray-500">{message.time}</span>
                  </div>
                  {message.role && (
                    <div className="text-xs text-gray-400 mb-1">{message.role}</div>
                  )}
                  <p className="text-sm text-gray-300 leading-relaxed">{message.message}</p>
                  {message.action && (
                    <div className="text-xs text-gray-500 mt-1 italic">{message.action}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-700">
            <div className="flex gap-2 mb-2">
              <Button className="bg-[#3a4466] hover:bg-[#4a5476] text-white text-xs px-3 py-1 rounded">
                ▶ Move Poundi
              </Button>
              <ChevronRight className="w-4 h-4 text-gray-500 mt-1" />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type your message..."
                className="flex-1 bg-[#1a1f3a] border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
              />
              <Button
                onClick={handleSendMessage}
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-4 py-2 rounded"
              >
                Draft Policy
              </Button>
            </div>
          </div>
        </div>

        {/* Middle Column - Welfare & City Parameters */}
        <div className="col-span-4 space-y-6">
          {/* Welfare Indicators */}
          <div className="bg-[#232847] rounded-lg border border-gray-700 p-4">
            <h2 className="text-amber-400 text-sm font-medium tracking-wide mb-4">WELFARE INDICATORS</h2>
            <div className="space-y-3">
              {welfareIndicators.map((indicator, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-300">{indicator.label}</span>
                    <span className="text-sm font-medium">{indicator.value}</span>
                  </div>
                  <div className="relative w-full h-2 bg-[#1a1f3a] rounded-full overflow-hidden">
                    <div
                      className={`absolute left-0 top-0 h-full ${indicator.color} rounded-full`}
                      style={{ width: `${(indicator.value / indicator.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* City Parameters */}
          <div className="bg-[#232847] rounded-lg border border-gray-700 p-4">
            <h2 className="text-amber-400 text-sm font-medium tracking-wide mb-4">CITY PARAMETERS</h2>
            <div className="grid grid-cols-3 gap-2">
              {cityParameters.map((param, idx) => (
                <Badge
                  key={idx}
                  className={`${
                    idx < 2 ? 'bg-blue-600' : idx === 2 ? 'bg-green-600' : idx === 3 ? 'bg-gray-600' : 'bg-amber-600'
                  } text-white text-xs px-3 py-2 justify-center`}
                >
                  {param.value} {param.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Identity Groups */}
          <div className="bg-[#232847] rounded-lg border border-gray-700 p-4">
            <h2 className="text-amber-400 text-sm font-medium tracking-wide mb-4">IDENTITY GROUPS</h2>
            <div className="space-y-2">
              {identityGroups.map((group, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-gray-300">{group.label}</span>
                    <div className="flex-1 relative h-2 bg-[#1a1f3a] rounded-full overflow-hidden">
                      <div
                        className={`absolute h-full ${group.color} rounded-full ${
                          group.value < 0 ? 'right-1/2' : 'left-1/2'
                        }`}
                        style={{ width: `${Math.abs(group.value) / 10}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium w-12 text-right">{group.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Identity Groups & Media */}
        <div className="col-span-4 space-y-6">
          {/* Identity Groups Checkboxes */}
          <div className="bg-[#232847] rounded-lg border border-gray-700 p-4">
            <h2 className="text-amber-400 text-sm font-medium tracking-wide mb-4">IDENTITY GROUPS</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked className="rounded" />
                <span>Middle Class</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded" />
                <span>Working Clawnn</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked className="rounded" />
                <span>Informal Sector</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked className="rounded" />
                <span>Secckian</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" defaultChecked className="rounded" />
                <span>Conservative</span>
              </label>
            </div>
          </div>

          {/* Media */}
          <div className="bg-[#232847] rounded-lg border border-gray-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-amber-400 text-sm font-medium tracking-wide">MEDIA</h2>
              <span className="text-xs text-gray-500">25 br/18</span>
            </div>
            <div className="space-y-3">
              <div className="bg-[#1a1f3a] rounded p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-red-500 text-xs font-medium">📰 Times of Bangalore</span>
                  <Badge className="bg-gray-700 text-white text-xs px-2 py-0.5">576</Badge>
                </div>
                <p className="text-xs text-gray-400">Ic North Tali and Hemipany: thrast 1005</p>
              </div>
              <div className="bg-[#1a1f3a] rounded p-3 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-blue-500 text-xs font-medium">📰 Janta Samachar</span>
                  <Badge className="bg-gray-700 text-white text-xs px-2 py-0.5">576</Badge>
                </div>
              </div>
            </div>
          </div>

          {/* City Chatter */}
          <div className="bg-[#232847] rounded-lg border border-gray-700 p-4">
            <h2 className="text-amber-400 text-sm font-medium tracking-wide mb-4">CITY CHATTER</h2>
            <div className="space-y-3">
              <div>
                <div className="font-medium text-sm mb-1">Scalding Powdek</div>
                <p className="text-xs text-gray-400">
                  If this r-extract trospentry, people will shortest teatruing.
                </p>
              </div>
              <div>
                <div className="font-medium text-sm mb-1">Ramna (Teacher)</div>
                <p className="text-xs text-gray-400">
                  Tooling frustating barngment, lextils boode infrarem troolls.
                </p>
                <p className="text-xs text-gray-500 mt-1">Vanti-Fi Tepoul</p>
              </div>
              <div>
                <div className="font-medium text-sm mb-1">Potld Booc ch</div>
                <p className="text-xs text-gray-400">
                  bremunit oiarumu hass noting nurs manta non gimose limitor.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}