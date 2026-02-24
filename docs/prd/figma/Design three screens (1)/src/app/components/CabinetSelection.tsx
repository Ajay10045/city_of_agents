import * as React from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Plus, X } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ScrollArea } from './ui/scroll-area';

interface Minister {
  id: string;
  name: string;
  profession: string;
  image: string;
  integrity: number;
  educationLevel: string;
  authorityRespect: number;
  competence: number;
  managerialSkill: number;
  strategicThinking: number;
  crisisHandling: number;
  bureaucraticNavigation: number;
}

interface SelectedMinister extends Minister {
  portfolios: string[];
}

interface Portfolio {
  id: string;
  name: string;
  color: string;
}

interface CabinetSelectionProps {
  onNext: () => void;
}

export function CabinetSelection({ onNext }: CabinetSelectionProps) {
  const [selectedMinisters, setSelectedMinisters] = React.useState<SelectedMinister[]>([
    {
      id: 'rajesh',
      name: 'Rajesh Deshmukh',
      profession: 'Economist',
      image: 'https://images.unsplash.com/photo-1700616466971-a4e05aa89e7d?w=300&h=300&fit=crop',
      integrity: 4,
      educationLevel: 'PhD Economics',
      authorityRespect: 5,
      competence: 4,
      managerialSkill: 3,
      strategicThinking: 5,
      crisisHandling: 3,
      bureaucraticNavigation: 4,
      portfolios: ['finance', 'economy']
    }
  ]);

  const availableApplicants: Minister[] = [
    {
      id: 'sajid',
      name: 'Sajid Khan',
      profession: 'Civil Engineer',
      image: 'https://images.unsplash.com/photo-1681141190048-b3f4b9ab3b5a?w=300&h=300&fit=crop',
      integrity: 3,
      educationLevel: 'Masters Engineering',
      authorityRespect: 3,
      competence: 4,
      managerialSkill: 3,
      strategicThinking: 2,
      crisisHandling: 4,
      bureaucraticNavigation: 3
    },
    {
      id: 'ananya',
      name: 'Ananya Iyer',
      profession: 'Healthcare Administrator',
      image: 'https://images.unsplash.com/photo-1629145185593-5339038e644f?w=300&h=300&fit=crop',
      integrity: 5,
      educationLevel: 'MD + MBA',
      authorityRespect: 4,
      competence: 5,
      managerialSkill: 5,
      strategicThinking: 4,
      crisisHandling: 4,
      bureaucraticNavigation: 3
    },
    {
      id: 'vikram',
      name: 'Vikram Patel',
      profession: 'Police Commissioner',
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=300&h=300&fit=crop',
      integrity: 4,
      educationLevel: 'Law Degree',
      authorityRespect: 5,
      competence: 4,
      managerialSkill: 4,
      strategicThinking: 3,
      crisisHandling: 5,
      bureaucraticNavigation: 5
    },
    {
      id: 'priya',
      name: 'Priya Sharma',
      profession: 'Education Reformer',
      image: 'https://images.unsplash.com/photo-1689600944138-da3b150d9cb8?w=300&h=300&fit=crop',
      integrity: 5,
      educationLevel: 'PhD Education',
      authorityRespect: 3,
      competence: 4,
      managerialSkill: 3,
      strategicThinking: 5,
      crisisHandling: 2,
      bureaucraticNavigation: 2
    },
    {
      id: 'arjun',
      name: 'Arjun Reddy',
      profession: 'Urban Planner',
      image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&h=300&fit=crop',
      integrity: 4,
      educationLevel: 'Masters Urban Planning',
      authorityRespect: 3,
      competence: 5,
      managerialSkill: 4,
      strategicThinking: 5,
      crisisHandling: 3,
      bureaucraticNavigation: 3
    },
    {
      id: 'meera',
      name: 'Meera Gupta',
      profession: 'Environmental Scientist',
      image: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=300&h=300&fit=crop',
      integrity: 5,
      educationLevel: 'PhD Environmental Science',
      authorityRespect: 2,
      competence: 5,
      managerialSkill: 2,
      strategicThinking: 4,
      crisisHandling: 3,
      bureaucraticNavigation: 2
    }
  ];

  const allPortfolios: Portfolio[] = [
    { id: 'finance', name: 'Finance', color: 'bg-amber-500' },
    { id: 'economy', name: 'Economy', color: 'bg-amber-600' },
    { id: 'health', name: 'Health', color: 'bg-green-500' },
    { id: 'education', name: 'Education', color: 'bg-blue-500' },
    { id: 'infrastructure', name: 'Infrastructure', color: 'bg-cyan-500' },
    { id: 'transport', name: 'Transport & Roads', color: 'bg-blue-600' },
    { id: 'security', name: 'Security & Law', color: 'bg-red-500' },
    { id: 'environment', name: 'Environment', color: 'bg-green-600' },
    { id: 'housing', name: 'Housing', color: 'bg-purple-500' },
    { id: 'water', name: 'Water & Power', color: 'bg-teal-500' },
    { id: 'commerce', name: 'Commerce', color: 'bg-orange-500' },
    { id: 'labor', name: 'Labor & Employment', color: 'bg-gray-600' }
  ];

  const allocatedPortfolios = selectedMinisters.flatMap(m => m.portfolios);
  const unallocatedPortfolios = allPortfolios.filter(p => !allocatedPortfolios.includes(p.id));

  const addMinisterToCabinet = (minister: Minister) => {
    setSelectedMinisters([...selectedMinisters, { ...minister, portfolios: [] }]);
  };

  const removeMinisterFromCabinet = (ministerId: string) => {
    setSelectedMinisters(selectedMinisters.filter(m => m.id !== ministerId));
  };

  const addPortfolioToMinister = (ministerId: string, portfolioId: string) => {
    setSelectedMinisters(selectedMinisters.map(m => 
      m.id === ministerId 
        ? { ...m, portfolios: [...m.portfolios, portfolioId] }
        : m
    ));
  };

  const removePortfolioFromMinister = (ministerId: string, portfolioId: string) => {
    setSelectedMinisters(selectedMinisters.map(m => 
      m.id === ministerId 
        ? { ...m, portfolios: m.portfolios.filter(p => p !== portfolioId) }
        : m
    ));
  };

  const renderStars = (count: number) => {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={i < count ? 'text-yellow-400 text-xs' : 'text-gray-600 text-xs'}>
            ★
          </span>
        ))}
      </div>
    );
  };

  const selectedIds = selectedMinisters.map(m => m.id);
  const filteredApplicants = availableApplicants.filter(a => !selectedIds.includes(a.id));

  return (
    <div className="min-h-screen bg-[#1a1f3a] text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-amber-400 text-sm font-medium tracking-wide mb-2">CABINET SELECTION</h1>
          <p className="text-gray-400 text-sm">
            Choose your ministers and assign portfolios to build your cabinet.
          </p>
        </div>

        <div className="grid grid-cols-12 gap-6 mb-6">
          {/* Left Section - Available Applicants */}
          <div className="col-span-7">
            <div className="bg-[#232847] rounded-lg border border-gray-700 h-[600px] flex flex-col">
              <div className="p-4 border-b border-gray-700">
                <h2 className="text-sm font-medium text-gray-400">AVAILABLE APPLICANTS</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                  {filteredApplicants.map((applicant) => (
                    <div
                      key={applicant.id}
                      className="bg-[#1a1f3a] rounded-lg p-4 border border-gray-700 hover:border-amber-400/50 transition-all"
                    >
                      <div className="flex gap-4">
                        <ImageWithFallback
                          src={applicant.image}
                          alt={applicant.name}
                          className="w-24 h-24 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-bold text-lg">{applicant.name}</h3>
                              <p className="text-sm text-gray-400">{applicant.profession}</p>
                            </div>
                            <Button
                              onClick={() => addMinisterToCabinet(applicant)}
                              className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-4 py-1 rounded text-sm"
                            >
                              Add to Cabinet
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs mt-3">
                            <div>
                              <div className="text-gray-400 mb-0.5">Education</div>
                              <div className="text-white">{applicant.educationLevel}</div>
                            </div>
                            <div>
                              <div className="text-gray-400 mb-0.5">Integrity</div>
                              {renderStars(applicant.integrity)}
                            </div>
                            <div>
                              <div className="text-gray-400 mb-0.5">Authority Respect</div>
                              {renderStars(applicant.authorityRespect)}
                            </div>
                            <div>
                              <div className="text-gray-400 mb-0.5">Competence</div>
                              {renderStars(applicant.competence)}
                            </div>
                            <div>
                              <div className="text-gray-400 mb-0.5">Managerial Skill</div>
                              {renderStars(applicant.managerialSkill)}
                            </div>
                            <div>
                              <div className="text-gray-400 mb-0.5">Strategic Thinking</div>
                              {renderStars(applicant.strategicThinking)}
                            </div>
                            <div>
                              <div className="text-gray-400 mb-0.5">Crisis Handling</div>
                              {renderStars(applicant.crisisHandling)}
                            </div>
                            <div>
                              <div className="text-gray-400 mb-0.5">Bureau. Navigation</div>
                              {renderStars(applicant.bureaucraticNavigation)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Section - Selected Cabinet */}
          <div className="col-span-5">
            <div className="bg-[#232847] rounded-lg border border-gray-700 h-[600px] flex flex-col">
              <div className="p-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-400">SELECTED CABINET</h2>
                  <span className="text-xs text-gray-500">{selectedMinisters.length} / 18</span>
                </div>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {selectedMinisters.map((minister) => (
                    <div
                      key={minister.id}
                      className="bg-[#1a1f3a] rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex gap-3 mb-3">
                        <ImageWithFallback
                          src={minister.image}
                          alt={minister.name}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-sm">{minister.name}</h3>
                              <p className="text-xs text-gray-400">{minister.profession}</p>
                            </div>
                            <button
                              onClick={() => removeMinisterFromCabinet(minister.id)}
                              className="text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-xs text-gray-400 mb-1">Portfolios:</div>
                        <div className="flex flex-wrap gap-2">
                          {minister.portfolios.map((portfolioId) => {
                            const portfolio = allPortfolios.find(p => p.id === portfolioId);
                            return portfolio ? (
                              <Badge
                                key={portfolioId}
                                className={`${portfolio.color} text-white text-xs px-2 py-1 flex items-center gap-1`}
                              >
                                {portfolio.name}
                                <button
                                  onClick={() => removePortfolioFromMinister(minister.id, portfolioId)}
                                  className="hover:text-red-200 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </Badge>
                            ) : null;
                          })}
                          {unallocatedPortfolios.length > 0 && (
                            <div className="relative group">
                              <button className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition-colors">
                                <Plus className="w-4 h-4" />
                              </button>
                              <div className="absolute left-0 top-8 bg-[#232847] border border-gray-700 rounded-lg p-2 hidden group-hover:block z-10 min-w-[200px]">
                                <div className="space-y-1">
                                  {unallocatedPortfolios.map((portfolio) => (
                                    <button
                                      key={portfolio.id}
                                      onClick={() => addPortfolioToMinister(minister.id, portfolio.id)}
                                      className="w-full text-left px-2 py-1 text-xs hover:bg-[#1a1f3a] rounded transition-colors"
                                    >
                                      {portfolio.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        {/* Bottom Section - Unallocated Portfolios */}
        <div className="bg-[#232847] rounded-lg border border-gray-700 p-4 mb-6">
          <h2 className="text-sm font-medium text-gray-400 mb-3">UNALLOCATED PORTFOLIOS</h2>
          <div className="flex flex-wrap gap-2">
            {unallocatedPortfolios.length > 0 ? (
              unallocatedPortfolios.map((portfolio) => (
                <Badge
                  key={portfolio.id}
                  className={`${portfolio.color} text-white text-sm px-3 py-1.5`}
                >
                  {portfolio.name}
                </Badge>
              ))
            ) : (
              <p className="text-gray-500 text-sm">All portfolios have been allocated!</p>
            )}
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