'use client';

import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play } from 'lucide-react';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'Selamat Pagi';
  if (hour >= 11 && hour < 15) return 'Selamat Siang';
  if (hour >= 15 && hour < 18) return 'Selamat Sore';
  return 'Selamat Malam';
};

const moods = [
  { id: 'semangat', emoji: '💪', label: 'Semangat' },
  { id: 'senang', emoji: '😊', label: 'Senang' },
  { id: 'biasa', emoji: '😐', label: 'Biasa' },
  { id: 'lelah', emoji: '😴', label: 'Lelah' },
  { id: 'sedih', emoji: '😢', label: 'Sedih' },
];

export default function WelcomeWorkModal({ user, onStartWork }) {
  const [selectedMood, setSelectedMood] = useState(null);

  const handleStartWork = () => {
    onStartWork(selectedMood || 'biasa');
  };

  return (
    <Dialog open={true}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="text-center py-4">
          {/* Greeting */}
          <div className="mb-6">
            <p className="text-lg text-gray-500">{getGreeting()},</p>
            <h2 className="text-2xl font-bold text-gray-900 mt-1">{user?.name || 'Karyawan'} 👋</h2>
          </div>

          {/* Mood Selection */}
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-3">Bagaimana perasaanmu hari ini?</p>
            <div className="flex justify-center gap-3">
              {moods.map((mood) => (
                <button
                  key={mood.id}
                  onClick={() => setSelectedMood(mood.id)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
                    selectedMood === mood.id
                      ? 'bg-blue-50 border-2 border-blue-400 scale-110'
                      : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                  }`}
                >
                  <span className="text-2xl">{mood.emoji}</span>
                  <span className="text-[10px] text-gray-600 font-medium">{mood.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Start Work Button */}
          <Button
            onClick={handleStartWork}
            disabled={!selectedMood}
            className="w-full py-6 text-base font-semibold gap-2"
            size="lg"
          >
            <Play className="w-5 h-5" />
            Mulai Bekerja
          </Button>

          {!selectedMood && (
            <p className="text-xs text-gray-400 mt-2">Pilih mood dulu ya</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
