'use client';

import { useState, useEffect } from 'react';
import { workSessionAPI } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Clock, Calendar, Users, ChevronDown, ChevronUp, Timer, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

export default function WorkHoursPage({ user }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('day');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [userSessions, setUserSessions] = useState({});

  useEffect(() => {
    fetchSummary();
  }, [period, date]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const data = await workSessionAPI.getSummary({ period, date });
      setEmployees(data.employees || []);
    } catch (err) {
      toast.error('Gagal memuat data jam kerja');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserSessions = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);

    try {
      const params = { userId };
      if (period === 'day') {
        params.date = date;
      } else if (period === 'week') {
        const d = new Date(date);
        const start = new Date(d);
        start.setDate(start.getDate() - 6);
        params.startDate = start.toISOString().split('T')[0];
        params.endDate = date;
      } else {
        const d = new Date(date);
        params.startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        params.endDate = lastDay.toISOString().split('T')[0];
      }
      const data = await workSessionAPI.getSessions(params);
      setUserSessions(prev => ({ ...prev, [userId]: data.sessions || [] }));
    } catch (err) {
      toast.error('Gagal memuat detail sesi');
    }
  };

  const getHoursBadgeColor = (minutes) => {
    if (period !== 'day') return 'bg-blue-100 text-blue-800';
    if (minutes >= 480) return 'bg-green-100 text-green-800'; // >= 8h
    if (minutes >= 360) return 'bg-yellow-100 text-yellow-800'; // >= 6h
    return 'bg-red-100 text-red-800'; // < 6h
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (isoStr) => {
    if (!isoStr) return '-';
    return new Date(isoStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const totalActiveEmployees = employees.filter(e => e.total_minutes > 0 || e.is_working).length;
  const currentlyWorking = employees.filter(e => e.is_working).length;
  const avgMinutes = totalActiveEmployees > 0
    ? Math.round(employees.reduce((s, e) => s + e.total_minutes, 0) / totalActiveEmployees)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-600" />
            Jam Kerja Karyawan
          </h2>
          <p className="text-sm text-gray-500 mt-1">Pantau jam kerja berdasarkan aplikasi desktop</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {['day', 'week', 'month'].map(p => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriod(p)}
                className="text-xs"
              >
                {p === 'day' ? 'Hari' : p === 'week' ? 'Minggu' : 'Bulan'}
              </Button>
            ))}
          </div>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto text-sm"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActiveEmployees}</p>
                <p className="text-xs text-gray-500">Karyawan tercatat</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Timer className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{currentlyWorking}</p>
                <p className="text-xs text-gray-500">Sedang bekerja</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {Math.floor(avgMinutes / 60)}j {avgMinutes % 60}m
                </p>
                <p className="text-xs text-gray-500">Rata-rata {period === 'day' ? 'hari ini' : period === 'week' ? 'minggu ini' : 'bulan ini'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Rekap Jam Kerja — {period === 'day' ? new Date(date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : period === 'week' ? `Minggu s.d. ${new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })}`
              : new Date(date).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Memuat data...</div>
          ) : employees.length === 0 ? (
            <div className="text-center py-8 text-gray-500">Tidak ada data</div>
          ) : (
            <div className="space-y-2">
              {employees.map(emp => (
                <div key={emp.user_id}>
                  <div
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => fetchUserSessions(emp.user_id)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={emp.profile_photo} />
                        <AvatarFallback className="bg-blue-600 text-white text-sm">
                          {emp.name?.charAt(0).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">{emp.name}</p>
                        <p className="text-xs text-gray-500">{emp.email}</p>
                      </div>
                      {emp.is_working && (
                        <Badge className="bg-green-100 text-green-700 text-[10px]">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1 animate-pulse inline-block" />
                          Online
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Badge className={`${getHoursBadgeColor(emp.total_minutes)} text-xs`}>
                          {emp.totalFormatted || '0j 0m'}
                        </Badge>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {emp.session_count} sesi
                        </p>
                      </div>
                      {emp.first_clock_in && (
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-gray-400">Masuk: {formatTime(emp.first_clock_in)}</p>
                          <p className="text-[10px] text-gray-400">Pulang: {emp.last_clock_out ? formatTime(emp.last_clock_out) : '-'}</p>
                        </div>
                      )}
                      {expandedUser === emp.user_id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded session details */}
                  {expandedUser === emp.user_id && userSessions[emp.user_id] && (
                    <div className="ml-12 mr-3 mb-3 border-l-2 border-blue-200 pl-4 space-y-1.5">
                      {userSessions[emp.user_id].length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">Tidak ada sesi</p>
                      ) : (
                        userSessions[emp.user_id].map(session => (
                          <div key={session.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-md px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              <span className="text-gray-600">{formatDate(session.clock_in)}</span>
                              <span className="text-gray-800 font-medium">
                                {formatTime(session.clock_in)} — {session.clock_out ? formatTime(session.clock_out) : 'Masih aktif'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]">
                                {session.source === 'electron' ? 'Desktop' : 'Browser'}
                              </Badge>
                              {session.duration_minutes ? (
                                <span className="text-gray-600">{Math.floor(session.duration_minutes / 60)}j {Math.round(session.duration_minutes % 60)}m</span>
                              ) : (
                                <span className="text-green-600 font-medium">Aktif</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
