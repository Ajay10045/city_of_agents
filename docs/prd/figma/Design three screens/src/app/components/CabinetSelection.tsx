import * as React from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { CheckCircle2 } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Minister {
  id: string;
  name: string;
  role: string;
  image: string;
  portfolios: { label: string; color: string }[];
  traits: { label: string; color: string }[];
  loyalty: number;
  integrity: number;
  capability: number;
}

interface CabinetSelectionProps {
  onNext: () => void;
}

export function CabinetSelection({ onNext }: CabinetSelectionProps) {
  const [selectedMinister, setSelectedMinister] = React.useState<string | null>(null);
  const [currentCabinet, setCurrentCabinet] = React.useState<string[]>(['rajesh']);

  const ministers: Minister[] = [
    {
      id: 'rajesh',
      name: 'Rajesh Deshmukh',
      role: 'Minister',
      image: 'https://images.unsplash.com/photo-1700616466971-a4e05aa89e7d?w=300&h=300&fit=crop',
      portfolios: [
        { label: 'Economics', color: 'bg-amber-500' }
      ],
      traits: [
        { label: 'Trait of Enfieldier', color: 'bg-blue-500' }
      ],
      loyalty: 3,
      integrity: 4,
      capability: 4
    },
    {
      id: 'sajid',
      name: 'Sajid Khan',
      role: 'Nansitra Pionure',
      image: 'https://images.unsplash.com/photo-1681141190048-b3f4b9ab3b5a?w=300&h=300&fit=crop',
      portfolios: [
        { label: 'Transitt & Roads', color: 'bg-blue-500' },
        { label: 'Nartie of Power', color: 'bg-blue-600' }
      ],
      traits: [],
      loyalty: 2,
      integrity: 2,
      capability: 3
    },
    {
      id: 'ananya',
      name: 'Ananya Iyer',
      role: 'Duaing Mantra',
      image: 'https://images.unsplash.com/photo-1629145185593-5339038e644f?w=300&h=300&fit=crop',
      portfolios: [
        { label: 'Marin of Ouis', color: 'bg-teal-500' },
        { label: 'Marnit di Ralicpr', color: 'bg-orange-500' },
        { label: 'Rapid Conoption', color: 'bg-gray-600' }
      ],
      traits: [],
      loyalty: 4,
      integrity: 5,
      capability: 3
    }
  ];

  const cabinetMinisters = [
    {
      name: 'Rajesh Deshmukh',
      portfolios: [
        { label: 'Economics', color: 'bg-amber-500' },
        { label: 'Rops', color: 'bg-blue-500' }
      ]
    },
    {
      name: 'Sajid Khan',
      portfolios: [
        { label: 'Economics', color: 'bg-amber-500' },
        { label: 'Water & Power', color: 'bg-amber-600' }
      ]
    }
  ];

  const renderStars = (count: number) => {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={i < count ? 'text-yellow-400' : 'text-gray-600'}>
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#1a1f3a] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-amber-400 text-sm font-medium tracking-wide mb-2">CABINET SELECTION</h1>
            <p className="text-gray-400 text-sm mb-1">
              Choose your ministers and assign portfolios.
            </p>
            <p className="text-gray-400 text-sm">
              You can assign multiple portfolios to one minister.
            </p>
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-gray-400">🏛️ Cumotele: 302</span>
            <span className="text-gray-400">Loyalty 223</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-6">
          <div className="col-span-2 space-y-6">
            {/* Applicants Section */}
            <div className="grid grid-cols-3 gap-4">
              {ministers.map((minister) => (
                <div
                  key={minister.id}
                  onClick={() => setSelectedMinister(minister.id)}
                  className={`bg-[#232847] rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                    selectedMinister === minister.id ? 'border-amber-400' : 'border-transparent hover:border-gray-600'
                  }`}
                >
                  <div className="relative">
                    <ImageWithFallback
                      src={minister.image}
                      alt={minister.name}
                      className="w-full h-48 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-lg">{minister.name}</h3>
                    <p className="text-xs text-gray-400 mb-3">
                      {minister.role} {minister.id === 'sajid' && <span className="text-blue-400">🔵</span>}
                    </p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {minister.portfolios.map((portfolio, idx) => (
                        <Badge key={idx} className={`${portfolio.color} text-white text-xs px-2 py-0.5`}>
                          {portfolio.label}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {minister.traits.map((trait, idx) => (
                        <Badge key={idx} className={`${trait.color} text-white text-xs px-2 py-0.5`}>
                          {trait.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Sidebar - Applicants & Current Cabinet */}
          <div className="space-y-6">
            {/* Applicants Stats */}
            {selectedMinister && (
              <div className="bg-[#232847] rounded-lg p-4 border border-gray-700">
                <h3 className="text-sm font-medium mb-4 text-gray-400">APPLICANTS</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-gray-400 mb-1">Loyalty</div>
                    {renderStars(ministers.find(m => m.id === selectedMinister)?.loyalty || 0)}
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Integrity</div>
                    {renderStars(ministers.find(m => m.id === selectedMinister)?.integrity || 0)}
                  </div>
                  <div>
                    <div className="text-gray-400 mb-1">Capability</div>
                    {renderStars(ministers.find(m => m.id === selectedMinister)?.capability || 0)}
                  </div>
                </div>
              </div>
            )}

            {/* Current Cabinet List */}
            <div className="bg-[#232847] rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-400">CURRENT CABINET</h3>
                <span className="text-xs text-gray-500">3 0/18</span>
              </div>
              <div className="space-y-3">
                {cabinetMinisters.map((minister, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <ImageWithFallback
                        src={`https://images.unsplash.com/photo-${idx === 0 ? '1507003211169-0a1dd7228f2d' : '1494790108377-be9c29b29330'}?w=40&h=40&fit=crop`}
                        alt={minister.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm mb-1 truncate">{minister.name}</div>
                        <div className="flex flex-wrap gap-1">
                          {minister.portfolios.map((portfolio, pIdx) => (
                            <Badge key={pIdx} className={`${portfolio.color} text-white text-xs px-2 py-0.5`}>
                              {portfolio.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button className="text-blue-400 hover:text-blue-300 transition-colors mt-2">
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Current Minister to Apply */}
            <div className="bg-[#232847] rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-400">CURRENT CABINET</h3>
                <span className="text-xs text-gray-500">3 0/18</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Rajesh Deshmukh</span>
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs px-4 py-1 rounded">
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={onNext}
            className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-8 py-2 rounded"
          >
            Continue to Game
          </Button>
        </div>
      </div>
    </div>
  );
}