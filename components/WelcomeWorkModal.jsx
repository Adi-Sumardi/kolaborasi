'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Play, Calendar, AlertCircle } from 'lucide-react';
import { jobdeskAPI } from '@/lib/api';

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
  const [upcomingJobdesks, setUpcomingJobdesks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        const res = await jobdeskAPI.getAll({ status: 'pending,in_progress', limit: 10 });
        setUpcomingJobdesks(res.jobdesks || []);
      } catch (error) {
        console.error('Failed to load upcoming tasks:', error);
      } finally {
        setLoadingTasks(false);
      }
    };
    loadTasks();
  }, []);

  const handleStartWork = () => {
    onStartWork(selectedMood || 'biasa');
  };

  const isDeadlineNear = (dateString) => {
    if (!dateString) return false;
    const deadline = new Date(dateString);
    const today = new Date();
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  };

  const isLate = (dateString) => {
    if (!dateString) return false;
    const deadline = new Date(dateString);
    deadline.setHours(23, 59, 59, 999);
    return new Date() > deadline;
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
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-2">Bagaimana perasaanmu hari ini?</p>
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

          {/* Task & Deadline Reminder */}
          <div className="mb-6 bg-blue-50 rounded-lg p-4 text-left border border-blue-100 max-h-48 overflow-y-auto">
            <h3 className="font-semibold text-blue-900 flex items-center mb-3">
              <Calendar className="w-4 h-4 mr-2" />
              Prioritas Jobdesk Anda
            </h3>
            
            {loadingTasks ? (
              <p className="text-sm text-gray-500">Memuat data task...</p>
            ) : upcomingJobdesks.length === 0 ? (
              <p className="text-sm text-green-600">Tidak ada jobdesk tertunda! 🎉</p>
            ) : (
              <div className="space-y-2">
                {upcomingJobdesks.map(job => (
                  <div key={job.id} className="flex justify-between items-center text-sm p-2 bg-white rounded border">
                    <span className="truncate pr-2 font-medium">{job.title}</span>
                    {job.dueDate && (
                      <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full ${
                        isLate(job.dueDate) ? 'bg-red-100 text-red-700' : 
                        isDeadlineNear(job.dueDate) ? 'bg-orange-100 text-orange-700' : 
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {new Date(job.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
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
