'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { kpiAPI, jobdeskAPI, todoAPI, dailyLogAPI } from '@/lib/api';
import { BarChart3, ClipboardList, CheckSquare, TrendingUp, Clock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function DashboardHome({ user }) {
  const [kpiData, setKpiData] = useState(null);
  const [jobdesks, setJobdesks] = useState([]);
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [kpi, jobdeskRes, todoRes] = await Promise.all([
        kpiAPI.get({ userId: user.id }),
        jobdeskAPI.getAll(),
        todoAPI.getAll()
      ]);

      setKpiData(kpi.kpi);
      setJobdesks(jobdeskRes.jobdesks || []);
      setTodos(todoRes.todos || []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  const pendingJobdesks = jobdesks.filter(j => j.status === 'pending').length;
  const inProgressJobdesks = jobdesks.filter(j => j.status === 'in_progress').length;
  const completedJobdesks = jobdesks.filter(j => j.status === 'completed').length;
  const pendingTodos = todos.filter(t => t.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Selamat Datang, {user.name}! 👋</h1>
        <p className="text-gray-600 mt-1">Ini adalah ringkasan aktivitas Anda hari ini</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI Score */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KPI Score</CardTitle>
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {kpiData?.score?.toFixed(1) || '0.0'}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {kpiData?.completionRate || 0}% tingkat penyelesaian
            </p>
            <Progress value={kpiData?.score || 0} className="mt-2" />
          </CardContent>
        </Card>

        {/* Total Jobdesks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobdesk</CardTitle>
            <ClipboardList className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobdesks.length}</div>
            <p className="text-xs text-gray-500 mt-1">
              <span className="text-green-600">{completedJobdesks} selesai</span>,{' '}
              <span className="text-yellow-600">{inProgressJobdesks} proses</span>,{' '}
              <span className="text-gray-600">{pendingJobdesks} pending</span>
            </p>
          </CardContent>
        </Card>

        {/* Total Hours */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jam Kerja</CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpiData?.totalHours || 0} jam</div>
            <p className="text-xs text-gray-500 mt-1">
              {kpiData?.totalLogs || 0} log aktivitas bulan ini
            </p>
          </CardContent>
        </Card>

        {/* Pending Todos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">To-Do List</CardTitle>
            <CheckSquare className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingTodos}</div>
            <p className="text-xs text-gray-500 mt-1">
              tugas menunggu dari {todos.length} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Jobdesks */}
      <Card>
        <CardHeader>
          <CardTitle>Jobdesk Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          {jobdesks.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Belum ada jobdesk</p>
          ) : (
            <div className="space-y-3">
              {jobdesks.slice(0, 5).map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{job.title}</p>
                    <p className="text-sm text-gray-600">{job.description}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    {job.status === 'pending' && (
                      <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded-full">
                        Pending
                      </span>
                    )}
                    {job.status === 'in_progress' && (
                      <span className="px-2 py-1 bg-yellow-200 text-yellow-700 text-xs rounded-full">
                        Proses
                      </span>
                    )}
                    {job.status === 'completed' && (
                      <span className="px-2 py-1 bg-green-200 text-green-700 text-xs rounded-full">
                        Selesai
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}