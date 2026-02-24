import * as React from 'react';
import { CitySelection } from './components/CitySelection';
import { CabinetSelection } from './components/CabinetSelection';
import { AdvisoryChat } from './components/AdvisoryChat';
import { Button } from './components/ui/button';

type Screen = 'city' | 'cabinet' | 'advisory';

export default function App() {
  const [currentScreen, setCurrentScreen] = React.useState<Screen>('city');
  const [selectedCity, setSelectedCity] = React.useState<string | null>(null);
  const [turns, setTurns] = React.useState<number>(30);
  const [population, setPopulation] = React.useState<number>(10);

  const handleStartGame = (city: string, turnCount: number, populationCount: number) => {
    setSelectedCity(city);
    setTurns(turnCount);
    setPopulation(populationCount);
    setCurrentScreen('cabinet');
  };

  const handleContinueToGame = () => {
    setCurrentScreen('advisory');
  };

  const handleClose = () => {
    setCurrentScreen('city');
  };

  return (
    <div className="min-h-screen bg-[#1a1f3a] relative">
      {/* Screen Navigation Bar - for easy testing */}
      <div className="fixed top-4 right-4 z-50 flex gap-2 bg-[#232847] p-2 rounded-lg border border-gray-700">
        <Button
          onClick={() => setCurrentScreen('city')}
          className={`text-xs px-3 py-1 ${
            currentScreen === 'city' ? 'bg-amber-500 text-black' : 'bg-gray-700 text-white'
          }`}
          size="sm"
        >
          City Selection
        </Button>
        <Button
          onClick={() => setCurrentScreen('cabinet')}
          className={`text-xs px-3 py-1 ${
            currentScreen === 'cabinet' ? 'bg-amber-500 text-black' : 'bg-gray-700 text-white'
          }`}
          size="sm"
        >
          Cabinet
        </Button>
        <Button
          onClick={() => setCurrentScreen('advisory')}
          className={`text-xs px-3 py-1 ${
            currentScreen === 'advisory' ? 'bg-amber-500 text-black' : 'bg-gray-700 text-white'
          }`}
          size="sm"
        >
          Advisory
        </Button>
      </div>

      {currentScreen === 'city' && (
        <CitySelection onClose={handleClose} onStartGame={handleStartGame} />
      )}
      {currentScreen === 'cabinet' && (
        <CabinetSelection onNext={handleContinueToGame} />
      )}
      {currentScreen === 'advisory' && <AdvisoryChat />}
    </div>
  );
}