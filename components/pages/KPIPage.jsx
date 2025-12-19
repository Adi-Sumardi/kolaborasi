'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { kpiV2API, userAPI } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, AlertTriangle, CheckCircle2, FileWarning, User, Calendar, Download, ChevronDown, ChevronUp, Clock, FileText, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function KPIPage({ user }) {
  const [kpiData, setKpiData] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedUsers, setExpandedUsers] = useState({});
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Generate PDF report
  const generatePdfReport = () => {
    setIsGeneratingPdf(true);

    // Create print-friendly content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan KPI - ${MONTHS[selectedMonth - 1]} ${selectedYear}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          h1 { text-align: center; margin-bottom: 5px; font-size: 18px; }
          h2 { text-align: center; margin-bottom: 20px; font-size: 14px; color: #666; }
          .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .summary { display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap; }
          .summary-item { background: #f5f5f5; padding: 10px; border-radius: 5px; min-width: 120px; }
          .summary-item strong { display: block; font-size: 18px; color: #333; }
          .summary-item span { font-size: 11px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; font-weight: bold; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .grade-a { color: green; font-weight: bold; }
          .grade-b { color: blue; font-weight: bold; }
          .grade-c { color: orange; font-weight: bold; }
          .grade-d { color: #ff6600; font-weight: bold; }
          .grade-e { color: red; font-weight: bold; }
          .late { color: #ff6600; }
          .deduction { color: red; }
          .employee-section { margin-bottom: 30px; page-break-inside: avoid; }
          .employee-header { background: #e8e8e8; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
          .employee-header h3 { margin: 0; font-size: 14px; }
          .employee-stats { display: flex; gap: 15px; margin-top: 5px; font-size: 11px; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
          @media print {
            body { padding: 10px; }
            .employee-section { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>LAPORAN KPI KARYAWAN</h1>
        <h2>Periode: ${MONTHS[selectedMonth - 1]} ${selectedYear}</h2>

        <div class="header-info">
          <div>Tanggal Cetak: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          <div>Total Karyawan: ${totalEmployees}</div>
        </div>

        <div class="summary">
          <div class="summary-item">
            <strong>${totalEmployees}</strong>
            <span>Total Karyawan</span>
          </div>
          <div class="summary-item">
            <strong>${totalJobdesksCompleted}</strong>
            <span>Jobdesk Selesai</span>
          </div>
          <div class="summary-item">
            <strong>${totalLateJobs}</strong>
            <span>Terlambat</span>
          </div>
          <div class="summary-item">
            <strong>${avgKpi}</strong>
            <span>Rata-rata KPI</span>
          </div>
          <div class="summary-item">
            <strong>${employeesNeedSp}</strong>
            <span>Perlu SP</span>
          </div>
        </div>

        <h3 style="margin-bottom: 10px;">Ringkasan Per Karyawan</h3>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Karyawan</th>
              <th>Divisi</th>
              <th class="text-center">Jobdesk</th>
              <th class="text-center">Total Poin</th>
              <th class="text-center">Rata-rata KPI</th>
              <th class="text-center">Terlambat</th>
              <th class="text-center">Surat Teguran</th>
              <th class="text-center">SP2DK</th>
              <th class="text-center">Grade</th>
              <th class="text-center">Status SP</th>
            </tr>
          </thead>
          <tbody>
            ${kpiData.map((emp, idx) => `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${emp.userName}</td>
                <td>${emp.divisionName || '-'}</td>
                <td class="text-center">${emp.totalJobdesks}</td>
                <td class="text-center">${emp.totalPoints}</td>
                <td class="text-center">${emp.averageKpi}</td>
                <td class="text-center ${emp.totalLateJobs > 0 ? 'late' : ''}">${emp.totalLateJobs || 0}</td>
                <td class="text-center ${emp.totalWarnings > 0 ? 'deduction' : ''}">${emp.totalWarnings || 0}</td>
                <td class="text-center ${emp.totalSp2dk > 0 ? 'deduction' : ''}">${emp.totalSp2dk || 0}</td>
                <td class="text-center grade-${emp.grade?.toLowerCase() || 'e'}">${emp.grade || '-'}</td>
                <td class="text-center">${emp.spLevel > 0 ? 'SP' + emp.spLevel : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${kpiData.filter(emp => emp.totalJobdesks > 0).map(emp => `
          <div class="employee-section">
            <div class="employee-header">
              <h3>${emp.userName} - ${emp.divisionName || 'Tanpa Divisi'}</h3>
              <div class="employee-stats">
                <span>Total Poin: <strong>${emp.totalPoints}</strong></span>
                <span>Rata-rata KPI: <strong>${emp.averageKpi}</strong></span>
                <span>Grade: <strong class="grade-${emp.grade?.toLowerCase() || 'e'}">${emp.grade}</strong></span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Jobdesk</th>
                  <th>Klien</th>
                  <th class="text-center">Poin Dasar</th>
                  <th class="text-center">Terlambat</th>
                  <th class="text-center">Surat Teguran</th>
                  <th class="text-center">SP2DK</th>
                  <th class="text-center">Potongan</th>
                  <th class="text-center">Poin Akhir</th>
                </tr>
              </thead>
              <tbody>
                ${(emp.jobdeskPoints || []).map(jp => `
                  <tr>
                    <td>${jp.jobdeskTitle}${jp.isLate ? ' <span class="late">(Terlambat)</span>' : ''}</td>
                    <td>${jp.clientName || '-'}</td>
                    <td class="text-center">${jp.basePoint}</td>
                    <td class="text-center ${jp.isLate ? 'late' : ''}">${jp.isLate ? '-' + jp.lateDeduction : 'Tepat Waktu'}</td>
                    <td class="text-center ${jp.warningCount > 0 ? 'deduction' : ''}">${jp.warningCount > 0 ? jp.warningCount + ' (-' + jp.warningDeduction + ')' : '0'}</td>
                    <td class="text-center ${jp.sp2dkCount > 0 ? 'deduction' : ''}">${jp.sp2dkCount > 0 ? jp.sp2dkCount + ' (-' + jp.sp2dkDeduction + ')' : '0'}</td>
                    <td class="text-center deduction">${jp.totalDeduction > 0 ? '-' + jp.totalDeduction : '0'}</td>
                    <td class="text-center"><strong>${jp.finalPoint}</strong></td>
                  </tr>
                `).join('')}
                <tr style="background: #f5f5f5; font-weight: bold;">
                  <td colspan="2">Total</td>
                  <td class="text-center">${emp.totalJobdesks * 100}</td>
                  <td class="text-center late">${emp.totalLateJobs > 0 ? emp.totalLateJobs + ' telat (-' + emp.totalLateDeduction + ')' : '-'}</td>
                  <td class="text-center deduction">${emp.totalWarnings > 0 ? emp.totalWarnings + ' surat' : '-'}</td>
                  <td class="text-center deduction">${emp.totalSp2dk > 0 ? emp.totalSp2dk + ' surat' : '-'}</td>
                  <td class="text-center deduction">-${(emp.totalLateDeduction || 0) + (emp.totalWarnings * 5) + (emp.totalSp2dk * 5)}</td>
                  <td class="text-center"><strong>${emp.totalPoints}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        `).join('')}

        <div class="footer">
          <p>Laporan ini digenerate secara otomatis oleh Sistem Kolaborasi</p>
          <p>Rumus KPI: Setiap jobdesk selesai = 100 poin | Terlambat = -5 poin | Surat Teguran = -5 poin | SP2DK = -5 poin</p>
        </div>
      </body>
      </html>
    `;

    // Open print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();

    // Wait for content to load then print
    printWindow.onload = () => {
      printWindow.print();
      setIsGeneratingPdf(false);
    };

    // Fallback if onload doesn't fire
    setTimeout(() => {
      setIsGeneratingPdf(false);
    }, 2000);
  };

  useEffect(() => {
    if (user.role !== 'karyawan') {
      loadUsers();
    }
  }, [user]);

  useEffect(() => {
    loadKPIData();
  }, [selectedUserId, selectedMonth, selectedYear]);

  const loadUsers = async () => {
    try {
      const res = await userAPI.getList();
      setUsers(res.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Gagal memuat data user');
    }
  };

  const loadKPIData = async () => {
    try {
      setLoading(true);
      const params = {
        month: selectedMonth,
        year: selectedYear
      };
      if (selectedUserId !== 'all') {
        params.userId = selectedUserId;
      }
      const res = await kpiV2API.getData(params);
      setKpiData(res.kpiData || []);
    } catch (error) {
      console.error('Failed to load KPI data:', error);
      toast.error('Gagal memuat data KPI');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (userId) => {
    setExpandedUsers(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  const getGradeBadge = (grade, color) => {
    const colorMap = {
      green: 'bg-green-100 text-green-800',
      blue: 'bg-blue-100 text-blue-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      orange: 'bg-orange-100 text-orange-800',
      red: 'bg-red-100 text-red-800',
      gray: 'bg-gray-100 text-gray-800'
    };
    return <Badge className={colorMap[color] || colorMap.gray}>{grade}</Badge>;
  };

  // Summary stats
  const totalEmployees = kpiData.length;
  const employeesWithJobdesks = kpiData.filter(k => k.totalJobdesks > 0).length;
  const totalJobdesksCompleted = kpiData.reduce((sum, k) => sum + k.totalJobdesks, 0);
  const totalLateJobs = kpiData.reduce((sum, k) => sum + (k.totalLateJobs || 0), 0);
  const avgKpi = employeesWithJobdesks > 0
    ? Math.round(kpiData.filter(k => k.totalJobdesks > 0).reduce((sum, k) => sum + k.averageKpi, 0) / employeesWithJobdesks)
    : 0;
  const employeesNeedSp = kpiData.filter(k => k.spLevel > 0).length;

  // Prepare chart data
  const chartData = kpiData
    .filter(k => k.totalJobdesks > 0)
    .map(k => ({
      name: k.userName.split(' ')[0],
      'Rata-rata KPI': k.averageKpi,
      'Total Jobdesk': k.totalJobdesks
    }));

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">KPI Karyawan</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Rekap poin berdasarkan jobdesk yang diselesaikan
          </p>
        </div>
        {['super_admin', 'owner', 'pengurus', 'sdm'].includes(user.role) && (
          <Button
            onClick={generatePdfReport}
            disabled={isGeneratingPdf || kpiData.length === 0}
            className="flex items-center gap-2"
          >
            {isGeneratingPdf ? (
              <>
                <span className="animate-spin">⏳</span>
                Generating...
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                Cetak Laporan PDF
              </>
            )}
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(user.role !== 'karyawan') && (
              <div>
                <Label>Karyawan</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih karyawan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">-- Semua Karyawan --</SelectItem>
                    {users.filter(u => !['super_admin', 'owner'].includes(u.role)).map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Bulan</Label>
              <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tahun</Label>
              <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2023, 2024, 2025, 2026].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">{totalEmployees}</div>
                <p className="text-xs text-gray-600">Total Karyawan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">{totalJobdesksCompleted}</div>
                <p className="text-xs text-gray-600">Jobdesk Selesai</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-600" />
              <div>
                <div className="text-2xl font-bold text-orange-600">{totalLateJobs}</div>
                <p className="text-xs text-gray-600">Terlambat</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-purple-600">{avgKpi}</div>
                <p className="text-xs text-gray-600">Rata-rata KPI</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-cyan-600" />
              <div>
                <div className="text-2xl font-bold text-cyan-600">{employeesWithJobdesks}</div>
                <p className="text-xs text-gray-600">Aktif Bekerja</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">{employeesNeedSp}</div>
                <p className="text-xs text-gray-600">Kandidat SP</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Perbandingan KPI Karyawan</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Rata-rata KPI" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* KPI Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detail KPI per Karyawan - {MONTHS[selectedMonth - 1]} {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {kpiData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Tidak ada data KPI untuk periode ini
            </div>
          ) : (
            <div className="space-y-4">
              {kpiData.map(emp => (
                <Collapsible
                  key={emp.userId}
                  open={expandedUsers[emp.userId]}
                  onOpenChange={() => toggleExpand(emp.userId)}
                >
                  <div className={`border rounded-lg ${emp.spLevel > 0 ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-4 hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <div className="text-left">
                            <div className="font-medium">{emp.userName}</div>
                            <div className="text-xs text-gray-500">{emp.userEmail}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Jobdesk</div>
                            <div className="font-bold">{emp.totalJobdesks}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Total Poin</div>
                            <div className="font-bold">{emp.totalPoints}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Rata-rata</div>
                            <div className={`font-bold text-lg ${emp.averageKpi < 60 ? 'text-red-600' : emp.averageKpi >= 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                              {emp.averageKpi}
                            </div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm text-gray-500">Grade</div>
                            {getGradeBadge(emp.grade, emp.gradeColor)}
                          </div>
                          {emp.spLevel > 0 && (
                            <Badge className="bg-red-100 text-red-800">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Kandidat SP
                            </Badge>
                          )}
                          {expandedUsers[emp.userId] ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t p-4">
                        {emp.jobdeskPoints.length === 0 ? (
                          <p className="text-center text-gray-500 py-4">
                            Tidak ada jobdesk yang diselesaikan bulan ini
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Jobdesk</TableHead>
                                <TableHead>Klien</TableHead>
                                <TableHead className="text-center">Poin Dasar</TableHead>
                                <TableHead className="text-center">Terlambat</TableHead>
                                <TableHead className="text-center">Surat Teguran</TableHead>
                                <TableHead className="text-center">SP2DK</TableHead>
                                <TableHead className="text-center">Potongan</TableHead>
                                <TableHead className="text-center">Poin Akhir</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {emp.jobdeskPoints.map((jp, idx) => (
                                <TableRow key={idx} className={jp.isLate ? 'bg-orange-50' : ''}>
                                  <TableCell className="font-medium">
                                    <div>
                                      {jp.jobdeskTitle}
                                      {jp.isLate && (
                                        <Badge className="ml-2 bg-orange-100 text-orange-800 text-xs">Terlambat</Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>{jp.clientName || '-'}</TableCell>
                                  <TableCell className="text-center">{jp.basePoint}</TableCell>
                                  <TableCell className="text-center">
                                    {jp.isLate ? (
                                      <Badge className="bg-orange-100 text-orange-800">-{jp.lateDeduction}</Badge>
                                    ) : (
                                      <span className="text-green-600">Tepat Waktu</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {jp.warningCount > 0 ? (
                                      <Badge variant="destructive">{jp.warningCount} (-{jp.warningDeduction})</Badge>
                                    ) : (
                                      <span className="text-gray-400">0</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {jp.sp2dkCount > 0 ? (
                                      <Badge variant="destructive">{jp.sp2dkCount} (-{jp.sp2dkDeduction})</Badge>
                                    ) : (
                                      <span className="text-gray-400">0</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-center text-red-600">
                                    {jp.totalDeduction > 0 ? `-${jp.totalDeduction}` : '0'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className={`font-bold ${jp.finalPoint < 60 ? 'text-red-600' : jp.finalPoint >= 90 ? 'text-green-600' : 'text-blue-600'}`}>
                                      {jp.finalPoint}
                                    </span>
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-gray-50 font-bold">
                                <TableCell colSpan={2}>Total</TableCell>
                                <TableCell className="text-center">{emp.totalJobdesks * 100}</TableCell>
                                <TableCell className="text-center text-orange-600">
                                  {emp.totalLateJobs > 0 ? `${emp.totalLateJobs} telat (-${emp.totalLateDeduction})` : '-'}
                                </TableCell>
                                <TableCell className="text-center text-red-600">
                                  {emp.totalWarnings > 0 ? `${emp.totalWarnings} surat` : '-'}
                                </TableCell>
                                <TableCell className="text-center text-red-600">
                                  {emp.totalSp2dk > 0 ? `${emp.totalSp2dk} surat` : '-'}
                                </TableCell>
                                <TableCell className="text-center text-red-600">
                                  -{(emp.totalLateDeduction || 0) + (emp.totalWarnings * 5) + (emp.totalSp2dk * 5)}
                                </TableCell>
                                <TableCell className="text-center text-lg">
                                  {emp.totalPoints}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        )}
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm">
                            <strong>Rumus KPI:</strong> Setiap jobdesk selesai = 100 poin |
                            Terlambat = -5 poin | Surat Teguran DJP = -5 poin | SP2DK = -5 poin |
                            <strong className="ml-2">Rata-rata KPI = Total Poin / Jumlah Jobdesk = {emp.totalPoints} / {emp.totalJobdesks} = {emp.averageKpi}</strong>
                          </p>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Keterangan */}
      <Card>
        <CardHeader>
          <CardTitle>Keterangan Grade</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-3 bg-green-50 rounded-lg">
              <Badge className="bg-green-100 text-green-800 text-lg">A</Badge>
              <p className="text-sm mt-1">90 - 100</p>
              <p className="text-xs text-gray-500">Sangat Baik</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <Badge className="bg-blue-100 text-blue-800 text-lg">B</Badge>
              <p className="text-sm mt-1">80 - 89</p>
              <p className="text-xs text-gray-500">Baik</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg">
              <Badge className="bg-yellow-100 text-yellow-800 text-lg">C</Badge>
              <p className="text-sm mt-1">70 - 79</p>
              <p className="text-xs text-gray-500">Cukup</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Badge className="bg-orange-100 text-orange-800 text-lg">D</Badge>
              <p className="text-sm mt-1">60 - 69</p>
              <p className="text-xs text-gray-500">Kurang</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <Badge className="bg-red-100 text-red-800 text-lg">E</Badge>
              <p className="text-sm mt-1">&lt; 60</p>
              <p className="text-xs text-gray-500">Kandidat SP</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
