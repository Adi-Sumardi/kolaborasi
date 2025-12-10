'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { kpiAPI, userAPI, dailyLogAPI } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Clock, CheckCircle2, Activity, Download } from 'lucide-react';
import { generateKPIPDF } from '@/lib/pdfUtils';

export default function KPIPage({ user }) {
  const [selectedUserId, setSelectedUserId] = useState(user.id);
  const [users, setUsers] = useState([]);
  const [kpiData, setKpiData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (user.role !== 'karyawan') {
      loadUsers();
    }
  }, [user]);

  useEffect(() => {
    loadKPIData();
  }, [selectedUserId, dateRange]);

  const loadUsers = async () => {
    try {
      const res = await userAPI.getAll();
      setUsers(res.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Gagal memuat data user');
    }
  };

  const loadKPIData = async () => {
    try {
      const [kpi, logsRes] = await Promise.all([
        kpiAPI.get({
          userId: selectedUserId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        }),
        dailyLogAPI.getAll({
          userId: selectedUserId,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        })
      ]);

      setKpiData(kpi.kpi);
      setLogs(logsRes.logs || []);
    } catch (error) {
      console.error('Failed to load KPI data:', error);
      toast.error('Gagal memuat data KPI');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  const pieData = [
    { name: 'Selesai', value: kpiData?.completedJobdesks || 0, color: '#10b981' },
    { name: 'Belum Selesai', value: (kpiData?.totalJobdesks || 0) - (kpiData?.completedJobdesks || 0), color: '#ef4444' }
  ];

  // Group logs by date
  const logsByDate = logs.reduce((acc, log) => {
    const date = new Date(log.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    if (!acc[date]) {
      acc[date] = 0;
    }
    acc[date] += log.hoursSpent || 0;
    return acc;
  }, {});

  const barData = Object.entries(logsByDate).map(([date, hours]) => ({
    date,
    hours
  }));

  const handleDownloadPDF = () => {
    try {
      const selectedUser = users.find(u => u.id === selectedUserId) || user;
      generateKPIPDF({
        user: selectedUser,
        kpiData,
        logs,
        dateRange,
        barData
      });
      toast.success('PDF berhasil didownload!');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Gagal membuat PDF');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">KPI Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Monitor performa dan statistik karyawan</p>
        </div>
        {(user.role === 'sdm' || user.role === 'pengurus' || user.role === 'super_admin') && (
          <Button onClick={handleDownloadPDF} className="w-full sm:w-auto">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(user.role !== 'karyawan') && (
              <div>
                <Label>Pilih Karyawan</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Tanggal Mulai</Label>
              <Input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Tanggal Akhir</Label>
              <Input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KPI Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {kpiData?.score?.toFixed(1) || '0.0'}
            </div>
            <p className="text-xs text-gray-500 mt-1">dari 100</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tingkat Penyelesaian</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {kpiData?.completionRate || 0}%
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {kpiData?.completedJobdesks || 0}/{kpiData?.totalJobdesks || 0} jobdesk
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jam Kerja</CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {kpiData?.totalHours || 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">jam kerja</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Log Aktivitas</CardTitle>
            <Activity className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {kpiData?.totalLogs || 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">entri log</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bar Chart - Hours per Day */}
        <Card>
          <CardHeader>
            <CardTitle>Jam Kerja per Hari</CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500">
                Tidak ada data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="hours" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart - Completion Rate */}
        <Card>
          <CardHeader>
            <CardTitle>Status Jobdesk</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.every(d => d.value === 0) ? (
              <div className="h-64 flex items-center justify-center text-gray-500">
                Tidak ada data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Log Aktivitas Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Tidak ada log aktivitas</p>
          ) : (
            <div className="space-y-3">
              {logs.slice(0, 10).map(log => (
                <div key={log.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{log.notes}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(log.date).toLocaleDateString('id-ID', { 
                        day: '2-digit', 
                        month: 'long', 
                        year: 'numeric' 
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-blue-600">{log.hoursSpent} jam</p>
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