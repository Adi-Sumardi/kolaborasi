'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { kpiV2API, userAPI } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp, Clock, CheckCircle2, AlertCircle, BarChart3,
  ChevronLeft, ChevronRight, Users, Building2, AlertTriangle, FileWarning, Target, Printer, Download
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function KPIPageV2({ user }) {
  const [kpiData, setKpiData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [activeTab, setActiveTab] = useState('overview');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = { month: selectedMonth, year: selectedYear };

      const [kpiRes, summaryRes] = await Promise.all([
        kpiV2API.getData(params),
        user.role !== 'karyawan' ? kpiV2API.getSummary(params) : Promise.resolve({ summary: null })
      ]);

      setKpiData(kpiRes.kpiData || []);
      setSummary(summaryRes.summary);
    } catch (error) {
      console.error('Failed to load KPI data:', error);
      toast.error('Gagal memuat data KPI');
    } finally {
      setLoading(false);
    }
  };

  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const getGradeColor = (grade) => {
    switch (grade) {
      case 'A': return 'bg-green-100 text-green-800 border-green-300';
      case 'B': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'C': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'D': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'E': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getKpiColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getGradeFullDescription = (grade) => {
    switch (grade) {
      case 'A': return 'A: 90-100 (Sangat Baik)';
      case 'B': return 'B: 80-89 (Baik)';
      case 'C': return 'C: 70-79 (Cukup)';
      case 'D': return 'D: 60-69 (Kurang)';
      case 'E': return 'E: <60 (Sangat Kurang)';
      default: return '-';
    }
  };

  const generatePdfReport = () => {
    setIsGeneratingPdf(true);

    const getGradeText = (grade) => {
      switch (grade) {
        case 'A': return 'Sangat Baik';
        case 'B': return 'Baik';
        case 'C': return 'Cukup';
        case 'D': return 'Kurang';
        case 'E': return 'Sangat Kurang';
        default: return '-';
      }
    };

    const getGradeColorPdf = (grade) => {
      switch (grade) {
        case 'A': return '#16a34a';
        case 'B': return '#2563eb';
        case 'C': return '#ca8a04';
        case 'D': return '#ea580c';
        case 'E': return '#dc2626';
        default: return '#6b7280';
      }
    };

    const tableRows = kpiData.map(kpi => `
      <tr>
        <td>${kpi.userName}</td>
        <td>${kpi.divisionName || '-'}</td>
        <td style="text-align: center;">${kpi.totalClients}</td>
        <td style="text-align: center;">${kpi.kpiHasilKinerja}</td>
        <td style="text-align: center;">${kpi.kpiEfektivitasWaktu}</td>
        <td style="text-align: center; font-weight: bold;">${kpi.overallKpi}</td>
        <td style="text-align: center; color: ${getGradeColorPdf(kpi.grade)}; font-weight: bold;">${kpi.grade}</td>
        <td style="text-align: center;">${kpi.spLevel > 0 ? 'Kandidat SP' : getGradeText(kpi.grade)}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan KPI - ${MONTHS[selectedMonth - 1]} ${selectedYear}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .header h1 { font-size: 24px; margin-bottom: 5px; }
          .header p { font-size: 14px; color: #666; }
          .period { font-size: 18px; font-weight: bold; margin: 10px 0; }
          .summary { display: flex; justify-content: space-around; margin-bottom: 30px; padding: 15px; background: #f3f4f6; border-radius: 8px; }
          .summary-item { text-align: center; }
          .summary-item .value { font-size: 24px; font-weight: bold; }
          .summary-item .label { font-size: 12px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 12px; }
          th { background: #f3f4f6; font-weight: bold; }
          tr:nth-child(even) { background: #f9fafb; }
          .legend { margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px; }
          .legend h4 { margin-bottom: 10px; }
          .legend-items { display: flex; gap: 15px; flex-wrap: wrap; }
          .legend-item { font-size: 11px; }
          .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 15px; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LAPORAN KPI PAJAK</h1>
          <p>Kolaborasi - Tax Management System</p>
          <div class="period">${MONTHS[selectedMonth - 1]} ${selectedYear}</div>
        </div>

        ${summary ? `
        <div class="summary">
          <div class="summary-item">
            <div class="value">${summary.employeesWithTasks}</div>
            <div class="label">Karyawan Aktif</div>
          </div>
          <div class="summary-item">
            <div class="value">${summary.totalTaxPeriods}</div>
            <div class="label">Total Klien</div>
          </div>
          <div class="summary-item">
            <div class="value" style="color: #ea580c;">${summary.issues?.warningLetters || 0}</div>
            <div class="label">Surat Teguran</div>
          </div>
          <div class="summary-item">
            <div class="value" style="color: #dc2626;">${summary.issues?.sp2dkNotices || 0}</div>
            <div class="label">SP2DK</div>
          </div>
        </div>
        ` : ''}

        <table>
          <thead>
            <tr>
              <th>Karyawan</th>
              <th>Divisi</th>
              <th style="text-align: center;">Klien</th>
              <th style="text-align: center;">Hasil Kinerja</th>
              <th style="text-align: center;">Efektivitas Waktu</th>
              <th style="text-align: center;">KPI Total</th>
              <th style="text-align: center;">Grade</th>
              <th style="text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <div class="legend">
          <h4>Keterangan Grade</h4>
          <div class="legend-items">
            <div class="legend-item"><strong style="color: #16a34a;">A:</strong> 90-100 (Sangat Baik)</div>
            <div class="legend-item"><strong style="color: #2563eb;">B:</strong> 80-89 (Baik)</div>
            <div class="legend-item"><strong style="color: #ca8a04;">C:</strong> 70-79 (Cukup)</div>
            <div class="legend-item"><strong style="color: #ea580c;">D:</strong> 60-69 (Kurang)</div>
            <div class="legend-item"><strong style="color: #dc2626;">E:</strong> &lt;60 (Sangat Kurang)</div>
          </div>
        </div>

        <div class="footer">
          Dicetak pada: ${new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();

    printWindow.onload = () => {
      printWindow.print();
      setIsGeneratingPdf(false);
    };
  };

  const generateIndividualPdf = (kpi) => {
    const getGradeText = (grade) => {
      switch (grade) {
        case 'A': return 'Sangat Baik';
        case 'B': return 'Baik';
        case 'C': return 'Cukup';
        case 'D': return 'Kurang';
        case 'E': return 'Sangat Kurang';
        default: return '-';
      }
    };

    const getGradeColorPdf = (grade) => {
      switch (grade) {
        case 'A': return '#16a34a';
        case 'B': return '#2563eb';
        case 'C': return '#ca8a04';
        case 'D': return '#ea580c';
        case 'E': return '#dc2626';
        default: return '#6b7280';
      }
    };

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>KPI ${kpi.userName} - ${MONTHS[selectedMonth - 1]} ${selectedYear}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; padding: 30px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .header h1 { font-size: 24px; margin-bottom: 5px; }
          .header p { font-size: 14px; color: #666; }
          .period { font-size: 16px; font-weight: bold; margin: 10px 0; }
          .employee-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .employee-info h2 { font-size: 20px; margin-bottom: 10px; }
          .employee-info p { font-size: 14px; color: #666; margin: 5px 0; }
          .kpi-cards { display: flex; gap: 20px; margin-bottom: 30px; flex-wrap: wrap; }
          .kpi-card { flex: 1; min-width: 150px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; text-align: center; }
          .kpi-card .value { font-size: 36px; font-weight: bold; }
          .kpi-card .label { font-size: 12px; color: #666; margin-top: 5px; }
          .grade-badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-weight: bold; font-size: 14px; }
          .detail-section { margin-bottom: 25px; }
          .detail-section h3 { font-size: 16px; margin-bottom: 10px; padding-bottom: 5px; border-bottom: 1px solid #ddd; }
          .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .detail-row:last-child { border-bottom: none; }
          .detail-label { color: #666; }
          .detail-value { font-weight: bold; }
          .status-section { margin-top: 20px; padding: 15px; border-radius: 8px; }
          .status-good { background: #dcfce7; border: 1px solid #86efac; }
          .status-warning { background: #fef3c7; border: 1px solid #fcd34d; }
          .status-danger { background: #fee2e2; border: 1px solid #fca5a5; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #666; border-top: 1px solid #ddd; padding-top: 15px; }
          @media print {
            body { padding: 15px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LAPORAN KPI INDIVIDUAL</h1>
          <p>Kolaborasi - Tax Management System</p>
          <div class="period">${MONTHS[selectedMonth - 1]} ${selectedYear}</div>
        </div>

        <div class="employee-info">
          <h2>${kpi.userName}</h2>
          <p>Email: ${kpi.userEmail}</p>
          <p>Divisi: ${kpi.divisionName || '-'}</p>
          <p>Total Klien Ditangani: ${kpi.totalClients}</p>
        </div>

        <div class="kpi-cards">
          <div class="kpi-card">
            <div class="value" style="color: ${getGradeColorPdf(kpi.grade)}">${kpi.overallKpi}</div>
            <div class="label">KPI Total</div>
            <div class="grade-badge" style="background: ${getGradeColorPdf(kpi.grade)}20; color: ${getGradeColorPdf(kpi.grade)}; margin-top: 10px;">
              Grade ${kpi.grade} - ${getGradeText(kpi.grade)}
            </div>
          </div>
          <div class="kpi-card">
            <div class="value" style="color: #2563eb">${kpi.kpiHasilKinerja}</div>
            <div class="label">KPI Hasil Kinerja</div>
          </div>
          <div class="kpi-card">
            <div class="value" style="color: #7c3aed">${kpi.kpiEfektivitasWaktu}</div>
            <div class="label">KPI Efektivitas Waktu</div>
          </div>
        </div>

        <div class="detail-section">
          <h3>Detail KPI Hasil Kinerja</h3>
          <div class="detail-row">
            <span class="detail-label">Skor Pajak</span>
            <span class="detail-value">${kpi.pajakScore || 0}%</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Skor Pembukuan</span>
            <span class="detail-value">${kpi.pembukuanScore || 0}%</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Potongan Surat Teguran</span>
            <span class="detail-value" style="color: ${kpi.warningLetterCount > 0 ? '#dc2626' : '#666'}">
              ${kpi.warningLetterCount > 0 ? `-${kpi.warningLetterCount * 5}% (${kpi.warningLetterCount} surat)` : '0'}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Potongan SP2DK</span>
            <span class="detail-value" style="color: ${kpi.sp2dkCount > 0 ? '#dc2626' : '#666'}">
              ${kpi.sp2dkCount > 0 ? `-${kpi.sp2dkCount * 5}% (${kpi.sp2dkCount} surat)` : '0'}
            </span>
          </div>
        </div>

        <div class="detail-section">
          <h3>Detail KPI Efektivitas Waktu</h3>
          <div class="detail-row">
            <span class="detail-label">Deadline Compliance</span>
            <span class="detail-value">${kpi.deadlineCompliance || 0}%</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Task Selesai Tepat Waktu</span>
            <span class="detail-value">${kpi.completedTasks || 0} dari ${kpi.totalTasks || 0} task</span>
          </div>
        </div>

        <div class="status-section ${kpi.overallKpi >= 80 ? 'status-good' : kpi.overallKpi >= 60 ? 'status-warning' : 'status-danger'}">
          <strong>Status: </strong>
          ${kpi.spLevel > 0
            ? `<span style="color: #dc2626;">Kandidat SP - KPI di bawah standar</span>`
            : kpi.overallKpi >= 80
              ? '<span style="color: #16a34a;">Performa Baik</span>'
              : kpi.overallKpi >= 60
                ? '<span style="color: #ca8a04;">Perlu Peningkatan</span>'
                : '<span style="color: #dc2626;">Perlu Perhatian Khusus</span>'
          }
        </div>

        <div class="footer">
          <p>Laporan digenerate pada: ${new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
          <p style="margin-top: 10px;">Rumus KPI: (KPI Hasil Kinerja × 50%) + (KPI Efektivitas Waktu × 50%)</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  // For karyawan, show only their own KPI
  const myKpi = user.role === 'karyawan' ? kpiData.find(k => k.userId === user.id) : null;

  if (loading) {
    return <div className="text-center py-8">Memuat data KPI...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">KPI Pajak</h1>
          <p className="text-gray-600 mt-1">Monitor KPI kinerja dan efektivitas tim pajak</p>
        </div>
        {['super_admin', 'owner', 'pengurus', 'sdm'].includes(user.role) && (
          <Button
            onClick={generatePdfReport}
            disabled={isGeneratingPdf || kpiData.length === 0}
            variant="outline"
          >
            <Printer className="w-4 h-4 mr-2" />
            {isGeneratingPdf ? 'Menyiapkan...' : 'Cetak Laporan PDF'}
          </Button>
        )}
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            {/* Quick Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="text-xl font-semibold min-w-[200px] text-center">
                {MONTHS[selectedMonth - 1]} {selectedYear}
              </div>
              <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Custom Filter Dropdowns */}
            <div className="flex items-center gap-2 border-l pl-4">
              <Select value={String(selectedMonth)} onValueChange={(val) => setSelectedMonth(Number(val))}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Pilih Bulan" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx + 1} value={String(idx + 1)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue placeholder="Tahun" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards for Managers */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold">{summary.employeesWithTasks}</div>
                  <p className="text-sm text-gray-600">Karyawan Aktif</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-2xl font-bold">{summary.totalTaxPeriods}</div>
                  <p className="text-sm text-gray-600">Total Klien</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
                <div>
                  <div className="text-2xl font-bold text-orange-600">{summary.issues?.warningLetters || 0}</div>
                  <p className="text-sm text-gray-600">Surat Teguran</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <FileWarning className="w-5 h-5 text-red-600" />
                <div>
                  <div className="text-2xl font-bold text-red-600">{summary.issues?.sp2dkNotices || 0}</div>
                  <p className="text-sm text-gray-600">SP2DK</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Karyawan Personal KPI */}
      {user.role === 'karyawan' && myKpi && (
        <div className="space-y-6">
          {/* KPI Score Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Overall KPI */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle className="text-center">KPI Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className={`text-6xl font-bold ${getKpiColor(myKpi.overallKpi)}`}>
                    {myKpi.overallKpi}
                  </div>
                  <Badge className={`mt-3 text-lg px-4 py-1 ${getGradeColor(myKpi.grade)}`}>
                    {getGradeFullDescription(myKpi.grade)}
                  </Badge>
                  {myKpi.spLevel > 0 && (
                    <div className="mt-3">
                      <Badge className="bg-red-100 text-red-800">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {myKpi.spDescription}
                      </Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Dual KPI Metrics */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Detail KPI</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* KPI Hasil Kinerja */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-blue-600" />
                      <span className="font-medium">KPI Hasil Kinerja</span>
                    </div>
                    <span className={`text-2xl font-bold ${getKpiColor(myKpi.kpiHasilKinerja)}`}>
                      {myKpi.kpiHasilKinerja}
                    </span>
                  </div>
                  <Progress value={myKpi.kpiHasilKinerja} className="h-3" />
                  <div className="mt-2 text-sm text-gray-600 grid grid-cols-2 gap-2">
                    <span>Pajak: {myKpi.pajakScore}%</span>
                    <span>Pembukuan: {myKpi.pembukuanScore}%</span>
                    <span>Surat Teguran: -{myKpi.warningLetterCount * 5}%</span>
                    <span>SP2DK: -{myKpi.sp2dkCount * 5}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="text-2xl font-bold">{myKpi.totalClients}</div>
                    <p className="text-sm text-gray-600">Klien Ditangani</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold text-green-600">{myKpi.completedTasks}</div>
                    <p className="text-sm text-gray-600">Task Selesai</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <div>
                    <div className="text-2xl font-bold text-orange-600">{myKpi.warningLetterCount}</div>
                    <p className="text-sm text-gray-600">Surat Teguran</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <FileWarning className="w-5 h-5 text-red-600" />
                  <div>
                    <div className="text-2xl font-bold text-red-600">{myKpi.sp2dkCount}</div>
                    <p className="text-sm text-gray-600">SP2DK</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Client Performance Table */}
          {myKpi.jobdeskPoints && myKpi.jobdeskPoints.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Rincian Klien yang Ditangani
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No</TableHead>
                        <TableHead>Klien</TableHead>
                        <TableHead>Jobdesk</TableHead>
                        <TableHead className="text-center">Poin Dasar</TableHead>
                        <TableHead className="text-center">Keterlambatan Jobdesk</TableHead>
                        <TableHead className="text-center">Task Type Telat</TableHead>
                        <TableHead className="text-center">Surat Teguran</TableHead>
                        <TableHead className="text-center">SP2DK</TableHead>
                        <TableHead className="text-center">Total Potongan</TableHead>
                        <TableHead className="text-center">Skor Akhir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myKpi.jobdeskPoints.map((jp, idx) => (
                        <TableRow key={jp.jobdeskId || idx} className={jp.isLate || jp.lateTaskTypeCount > 0 ? 'bg-orange-50' : ''}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="font-medium">{jp.clientName || '-'}</TableCell>
                          <TableCell>
                            {jp.jobdeskTitle}
                            {jp.isLate && (
                              <Badge className="ml-2 bg-orange-100 text-orange-800 text-xs">Terlambat</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{jp.basePoint}</TableCell>
                          <TableCell className="text-center">
                            {jp.isLate ? (
                              <span className="text-orange-600">-{jp.lateDeduction}</span>
                            ) : (
                              <span className="text-green-600">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {jp.lateTaskTypeCount > 0 ? (
                              <div>
                                <span className="text-orange-600">-{jp.taskTypeDeduction}</span>
                                <div className="text-xs text-gray-500 mt-1">
                                  {(jp.lateTaskTypes || []).map(t => {
                                    const labels = { pph_21: 'PPh 21', pph_unifikasi: 'PPh Unifikasi', pph_25: 'PPh 25', ppn: 'PPN', pph_badan: 'PPh Badan', pph_05: 'PPh 0,5%' };
                                    return labels[t] || t;
                                  }).join(', ')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {jp.warningCount > 0 ? (
                              <span className="text-red-600">-{jp.warningDeduction} ({jp.warningCount})</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {jp.sp2dkCount > 0 ? (
                              <span className="text-red-600">-{jp.sp2dkDeduction} ({jp.sp2dkCount})</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-red-600">
                            {jp.totalDeduction > 0 ? `-${jp.totalDeduction}` : '0'}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`font-bold ${jp.finalPoint >= 90 ? 'text-green-600' : jp.finalPoint >= 60 ? 'text-blue-600' : 'text-red-600'}`}>
                              {jp.finalPoint}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total Row */}
                      <TableRow className="bg-gray-100 font-bold">
                        <TableCell colSpan={3}>Total</TableCell>
                        <TableCell className="text-center">{myKpi.jobdeskPoints.length * 100}</TableCell>
                        <TableCell className="text-center text-orange-600">
                          {myKpi.totalLateJobs > 0 ? `-${myKpi.totalLateDeduction}` : '0'}
                        </TableCell>
                        <TableCell className="text-center text-orange-600">
                          {myKpi.totalLateTaskTypes > 0 ? `-${myKpi.totalTaskTypeDeduction}` : '0'}
                        </TableCell>
                        <TableCell className="text-center text-red-600">
                          {myKpi.totalWarnings > 0 ? `-${myKpi.totalWarnings * 5}` : '0'}
                        </TableCell>
                        <TableCell className="text-center text-red-600">
                          {myKpi.totalSp2dk > 0 ? `-${myKpi.totalSp2dk * 5}` : '0'}
                        </TableCell>
                        <TableCell className="text-center text-red-600">
                          -{(myKpi.totalLateDeduction || 0) + (myKpi.totalTaskTypeDeduction || 0) + (myKpi.totalWarnings * 5) + (myKpi.totalSp2dk * 5)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-lg font-bold">{myKpi.totalPoints}</span>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm">
                    <strong>Rumus KPI:</strong> Setiap jobdesk selesai = 100 poin |
                    Terlambat jobdesk = -5 poin | Task type telat (PPh/PPN) = -5 poin per jenis | Surat Teguran DJP = -5 poin | SP2DK = -5 poin |
                    <strong className="ml-2">Rata-rata KPI = Total Poin / Jumlah Jobdesk = {myKpi.totalPoints} / {myKpi.totalJobdesks} = {myKpi.averageKpi}</strong>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Manager View - Team KPI Table */}
      {user.role !== 'karyawan' && (
        <Card>
          <CardHeader>
            <CardTitle>KPI Tim - {MONTHS[selectedMonth - 1]} {selectedYear}</CardTitle>
          </CardHeader>
          <CardContent>
            {kpiData.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Tidak ada data KPI untuk periode ini
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Divisi</TableHead>
                      <TableHead className="text-center">Klien</TableHead>
                      <TableHead className="text-center">Hasil Kinerja</TableHead>
                      <TableHead className="text-center">Efektivitas Waktu</TableHead>
                      <TableHead className="text-center">KPI Total</TableHead>
                      <TableHead className="text-center">Grade</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpiData.map(kpi => (
                      <TableRow key={kpi.userId}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{kpi.userName}</div>
                            <div className="text-xs text-gray-500">{kpi.userEmail}</div>
                          </div>
                        </TableCell>
                        <TableCell>{kpi.divisionName || '-'}</TableCell>
                        <TableCell className="text-center">{kpi.totalClients}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${getKpiColor(kpi.kpiHasilKinerja)}`}>
                            {kpi.kpiHasilKinerja}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${getKpiColor(kpi.kpiEfektivitasWaktu)}`}>
                            {kpi.kpiEfektivitasWaktu}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`text-lg font-bold ${getKpiColor(kpi.overallKpi)}`}>
                            {kpi.overallKpi}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${getGradeColor(kpi.grade)}`}>
                            {kpi.grade}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {kpi.spLevel > 0 ? (
                            <Badge className="bg-red-100 text-red-800">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Kandidat SP
                            </Badge>
                          ) : (
                            <Badge className={`${getGradeColor(kpi.grade)}`}>
                              {kpi.grade === 'A' && 'Sangat Baik'}
                              {kpi.grade === 'B' && 'Baik'}
                              {kpi.grade === 'C' && 'Cukup'}
                              {kpi.grade === 'D' && 'Kurang'}
                              {kpi.grade === 'E' && 'Sangat Kurang'}
                              {kpi.grade === '-' && '-'}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => generateIndividualPdf(kpi)}
                            title="Download KPI PDF"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Legend */}
      <Card>
        <CardHeader>
          <CardTitle>Keterangan KPI</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">KPI Hasil Kinerja (50%)</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Pajak Bulanan (50%) - Bayar & Lapor PPh/PPN</li>
                <li>• Pembukuan (50%) - Kelengkapan pembukuan klien</li>
                <li>• Potongan: Surat Teguran (-5%), SP2DK (-5%)</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2">KPI Efektivitas Waktu (50%)</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Deadline Compliance - Task selesai tepat waktu</li>
                <li>• Dihitung dari semua task pajak dan pembukuan</li>
              </ul>
            </div>
            <div className="md:col-span-2">
              <h4 className="font-semibold mb-2">Skala Grade</h4>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-green-100 text-green-800">A: 90-100 (Sangat Baik)</Badge>
                <Badge className="bg-blue-100 text-blue-800">B: 80-89 (Baik)</Badge>
                <Badge className="bg-yellow-100 text-yellow-800">C: 70-79 (Cukup)</Badge>
                <Badge className="bg-orange-100 text-orange-800">D: 60-69 (Kurang)</Badge>
                <Badge className="bg-red-100 text-red-800">E: &lt;60 (Sangat Kurang)</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
