import * as React from 'react';
import { X, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { Slider } from './ui/slider';
import { Input } from './ui/input';

interface City {
  id: string;
  name: string;
  population: string;
  image: string;
  issues: { icon: string; label: string; color: string }[];
  growth: number;
  satisfaction: number;
}

interface CitySelectionProps {
  onClose: () => void;
  onStartGame: (city: string, turns: number, population: number) => void;
}

export function CitySelection({ onClose, onStartGame }: CitySelectionProps) {
  const cities: City[] = [
    {
      id: 'new-delhi',
      name: 'New Delhi',
      population: '32.9M',
      image: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=400&h=300&fit=crop',
      issues: [
        { icon: '🚦', label: 'Traffic Congestion', color: 'text-amber-400' },
        { icon: '🏭', label: 'Pollution', color: 'text-orange-400' }
      ],
      growth: 23,
      satisfaction: 8
    },
    {
      id: 'ranpur',
      name: 'Ranpur',
      population: '19.4M',
      image: 'https://images.unsplash.com/photo-1573790387438-4da905039392?w=400&h=300&fit=crop',
      issues: [
        { icon: '🏠', label: 'Housing Crisis', color: 'text-blue-400' },
        { icon: '🏘️', label: 'Paikur', color: 'text-blue-300' }
      ],
      growth: 8,
      satisfaction: 4
    },
    {
      id: 'karachi',
      name: 'Karachi',
      population: '15.4M',
      image: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=400&h=300&fit=crop',
      issues: [
        { icon: '🏛️', label: 'Bianamagazam', color: 'text-red-400' },
        { icon: '⚖️', label: 'Poisennanagam', color: 'text-orange-400' }
      ],
      growth: 8,
      satisfaction: 7
    },
    {
      id: 'dhaka',
      name: 'Dhaka',
      population: '10.3M',
      image: 'https://images.unsplash.com/photo-1542044896530-05d85be9b11a?w=400&h=300&fit=crop',
      issues: [
        { icon: '📊', label: 'Ehonticence', color: 'text-blue-400' },
        { icon: '👥', label: 'Social Impact', color: 'text-cyan-400' }
      ],
      growth: 8,
      satisfaction: 19
    },
    {
      id: 'colombo',
      name: 'Colombo',
      population: '5.6M',
      image: 'https://images.unsplash.com/photo-1608233799575-90a0e976c2c7?w=400&h=300&fit=crop',
      issues: [
        { icon: '💼', label: 'City/Insurance', color: 'text-red-400' },
        { icon: '🏙️', label: 'Reale mining', color: 'text-orange-400' }
      ],
      growth: 0,
      satisfaction: 0
    }
  ];

  const turnOptions = [10, 11, 22, 24, 110, 311, 21, 84, 124, 34, 5];
  const populationOptions = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
  const [selectedTurns, setSelectedTurns] = React.useState(30);
  const [selectedPopulation, setSelectedPopulation] = React.useState(10);
  const [selectedCity, setSelectedCity] = React.useState<string | null>(null);

  const handleTurnsChange = (value: number[]) => {
    setSelectedTurns(value[0]);
  };

  const handlePopulationChange = (value: number[]) => {
    setSelectedPopulation(value[0]);
  };

  const handleTurnsInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    setSelectedTurns(Math.min(Math.max(value, 1), 500));
  };

  const handlePopulationInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    setSelectedPopulation(Math.min(Math.max(value, 1), 100));
  };

  return (
    <div className="min-h-screen bg-[#1a1f3a] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-amber-400 text-sm font-medium tracking-wide mb-2">SELECT YOUR CITY</h1>
            <h2 className="text-4xl font-bold mb-4">CABINET SELECTION</h2>
            <p className="text-gray-400 text-sm">
              Choose your ministers and assign portfolios. You can assign multiple portfolios to one minister.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-4 mb-8">
          {cities.map((city) => (
            <div
              key={city.id}
              onClick={() => setSelectedCity(city.id)}
              className={`relative rounded-lg overflow-hidden cursor-pointer transition-all ${
                selectedCity === city.id ? 'ring-2 ring-amber-400' : 'hover:ring-2 hover:ring-gray-500'
              }`}
            >
              <ImageWithFallback
                src={city.image}
                alt={city.name}
                className="w-full h-48 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
              <div className="absolute top-4 left-4">
                <h3 className="text-xl font-bold">{city.name}</h3>
              </div>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="flex items-center gap-3 mb-2 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-cyan-400">👥</span>
                    <span>{city.population}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-green-400">📈</span>
                    <span>{city.growth}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-400">😊</span>
                    <span>{city.satisfaction}%</span>
                  </div>
                </div>
                <div className="space-y-1">
                  {city.issues.map((issue, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className={issue.color}>●</span>
                      <span className="text-gray-300">{issue.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#232847]/50 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center gap-8 flex-1">
              {/* Turns to Election */}
              <div className="flex items-center gap-4 flex-1">
                <span className="text-gray-400 whitespace-nowrap">Turns to Election:</span>
                <Slider
                  value={[selectedTurns]}
                  onValueChange={handleTurnsChange}
                  min={1}
                  max={500}
                  step={1}
                  className="flex-1 max-w-xs"
                />
                <Input
                  type="number"
                  value={selectedTurns}
                  onChange={handleTurnsInputChange}
                  min={1}
                  max={500}
                  className="w-20 bg-[#1a1f3a] border-gray-600 text-white text-center"
                />
              </div>

              {/* Population */}
              <div className="flex items-center gap-4 flex-1">
                <span className="text-gray-400 whitespace-nowrap">Population (M):</span>
                <Slider
                  value={[selectedPopulation]}
                  onValueChange={handlePopulationChange}
                  min={1}
                  max={100}
                  step={1}
                  className="flex-1 max-w-xs"
                />
                <Input
                  type="number"
                  value={selectedPopulation}
                  onChange={handlePopulationInputChange}
                  min={1}
                  max={100}
                  className="w-20 bg-[#1a1f3a] border-gray-600 text-white text-center"
                />
              </div>
            </div>

            <Button
              onClick={() => selectedCity && onStartGame(selectedCity, selectedTurns, selectedPopulation)}
              disabled={!selectedCity}
              className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-8 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed ml-8"
            >
              Start Game
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}