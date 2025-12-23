'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { kpiAPI, userAPI, dailyLogAPI, divisionAPI } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Clock, CheckCircle2, Activity, Download, Users, User, ArrowLeft } from 'lucide-react';
import { generateKPIPDF, generateAllKPIPDF } from '@/lib/pdfUtils';

export default function KPIPage({ user }) {
  const [viewMode, setViewMode] = useState('all'); // 'all' or 'individual'
  const [selectedUserId, setSelectedUserId] = useState(user.id);
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [kpiData, setKpiData] = useState(null);
  const [allKpiData, setAllKpiData] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [divisionFilter, setDivisionFilter] = useState('all');

  useEffect(() => {
    if (user.role !== 'karyawan') {
      loadUsers();
      loadDivisions();
    }
  }, [user]);

  useEffect(() => {
    if (viewMode === 'all' && user.role !== 'karyawan') {
      loadAllKPIData();
    } else {
      loadKPIData();
    }
  }, [selectedUserId, dateRange, viewMode]);

  const loadUsers = async () => {
    try {
      const res = await userAPI.getAll();
      setUsers(res.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Gagal memuat data user');
    }
  };

  const loadDivisions = async () => {
    try {
      const res = await divisionAPI.getAll();
      setDivisions(res.divisions || []);
    } catch (error) {
      console.error('Failed to load divisions:', error);
    }
  };

  const loadAllKPIData = async () => {
    setLoading(true);
    try {
      const res = await kpiAPI.getAll({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate
      });
      setAllKpiData(res.kpiList || []);
    } catch (error) {
      console.error('Failed to load all KPI data:', error);
      toast.error('Gagal memuat data KPI');
    } finally {
      setLoading(false);
    }
  };

  const loadKPIData = async () => {
    setLoading(true);
    try {
      const [kpi, logsRes] = await Promise.all([
        kpiAPI.getData({
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

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getScoreBadge = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  const getDivisionName = (divisionId) => {
    const division = divisions.find(d => d.id === divisionId);
    return division?.name || '-';
  };

  // Filter KPI data by division
  const filteredKpiData = divisionFilter === 'all'
    ? allKpiData
    : allKpiData.filter(kpi => kpi.divisionId === divisionFilter);

  const handleViewIndividual = (userId) => {
    setSelectedUserId(userId);
    setViewMode('individual');
  };

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

  const handleDownloadAllPDF = () => {
    try {
      generateAllKPIPDF({
        kpiList: filteredKpiData,
        divisions,
        dateRange,
        divisionFilter
      });
      toast.success('PDF berhasil didownload!');
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Gagal membuat PDF');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  // Individual view data
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

  // For karyawan, always show individual view
  if (user.role === 'karyawan') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">KPI Dashboard</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Monitor performa Anda</p>
          </div>
        </div>

        {/* Date Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

  // Admin/Pengurus/SDM view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">KPI Dashboard</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            {viewMode === 'all' ? 'Monitor performa semua karyawan' : 'Detail performa karyawan'}
          </p>
        </div>
        <div className="flex gap-2">
          {viewMode === 'individual' && (
            <Button variant="outline" onClick={() => setViewMode('all')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Kembali
            </Button>
          )}
          <Button onClick={viewMode === 'all' ? handleDownloadAllPDF : handleDownloadPDF}>
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {viewMode === 'all' && (
              <div>
                <Label>Filter Divisi</Label>
                <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua Divisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Divisi</SelectItem>
                    {divisions.map(div => (
                      <SelectItem key={div.id} value={div.id}>
                        {div.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {viewMode === 'individual' && (
              <div>
                <Label>Pilih Karyawan</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.role === 'karyawan').map(u => (
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

      {viewMode === 'all' ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Karyawan</CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">
                  {filteredKpiData.length}
                </div>
                <p className="text-xs text-gray-500 mt-1">karyawan aktif</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rata-rata KPI</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {filteredKpiData.length > 0
                    ? (filteredKpiData.reduce((sum, k) => sum + k.score, 0) / filteredKpiData.length).toFixed(1)
                    : '0.0'}
                </div>
                <p className="text-xs text-gray-500 mt-1">dari 100</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rata-rata Completion</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">
                  {filteredKpiData.length > 0
                    ? Math.round(filteredKpiData.reduce((sum, k) => sum + k.completionRate, 0) / filteredKpiData.length)
                    : 0}%
                </div>
                <p className="text-xs text-gray-500 mt-1">tingkat penyelesaian</p>
              </CardContent>
            </Card>
          </div>

          {/* KPI Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Daftar KPI Karyawan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredKpiData.length === 0 ? (
                <p className="text-center text-gray-500 py-8">Tidak ada data karyawan</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-4 font-semibold">Rank</th>
                        <th className="text-left py-3 px-4 font-semibold">Nama</th>
                        <th className="text-left py-3 px-4 font-semibold hidden md:table-cell">Divisi</th>
                        <th className="text-center py-3 px-4 font-semibold">KPI Score</th>
                        <th className="text-center py-3 px-4 font-semibold hidden sm:table-cell">Completion</th>
                        <th className="text-center py-3 px-4 font-semibold hidden lg:table-cell">Jam Kerja</th>
                        <th className="text-center py-3 px-4 font-semibold hidden lg:table-cell">Log</th>
                        <th className="text-center py-3 px-4 font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredKpiData.map((kpi, index) => (
                        <tr key={kpi.userId} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              index === 0 ? 'bg-yellow-400 text-yellow-900' :
                              index === 1 ? 'bg-gray-300 text-gray-800' :
                              index === 2 ? 'bg-orange-300 text-orange-900' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-medium">{kpi.userName}</p>
                              <p className="text-xs text-gray-500">{kpi.userEmail}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4 hidden md:table-cell">
                            <span className="text-gray-600">{getDivisionName(kpi.divisionId)}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${getScoreColor(kpi.score)}`}>
                              {kpi.score.toFixed(1)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center hidden sm:table-cell">
                            <div>
                              <span className="font-medium">{kpi.completionRate}%</span>
                              <p className="text-xs text-gray-500">{kpi.completedJobdesks}/{kpi.totalJobdesks}</p>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center hidden lg:table-cell">
                            <span className="text-purple-600 font-medium">{kpi.totalHours}</span>
                          </td>
                          <td className="py-3 px-4 text-center hidden lg:table-cell">
                            <span className="text-orange-600 font-medium">{kpi.totalLogs}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewIndividual(kpi.userId)}
                            >
                              <User className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Detail</span>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Individual View - KPI Metrics */}
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
        </>
      )}
    </div>
  );
}
