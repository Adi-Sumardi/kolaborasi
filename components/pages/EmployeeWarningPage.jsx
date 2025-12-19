'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { userAPI, kpiV2API } from '@/lib/api';
import {
  Plus, AlertTriangle, FileWarning, Calendar, User, Trash2, Edit, Clock,
  AlertCircle, CheckCircle2, TrendingDown, Download
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Helper function for API requests
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}/api/${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Employee Warning API
const employeeWarningAPI = {
  getAll: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`employee-warnings${query ? `?${query}` : ''}`);
  },
  create: (data) => apiRequest('employee-warnings', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiRequest(`employee-warnings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiRequest(`employee-warnings/${id}`, { method: 'DELETE' }),
  getStats: () => apiRequest('employee-warnings/stats'),
};

const SP_LEVELS = {
  1: { label: 'SP1', color: 'bg-yellow-100 text-yellow-800', description: 'Peringatan Pertama' },
  2: { label: 'SP2', color: 'bg-orange-100 text-orange-800', description: 'Peringatan Kedua' },
  3: { label: 'SP3', color: 'bg-red-100 text-red-800', description: 'Peringatan Terakhir (PHK Warning)' }
};

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function EmployeeWarningPage({ user }) {
  const [warnings, setWarnings] = useState([]);
  const [users, setUsers] = useState([]);
  const [kpiSummary, setKpiSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('issued');
  const [stats, setStats] = useState({ sp1: 0, sp2: 0, sp3: 0, total: 0 });

  // Warning Modal
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [editingWarning, setEditingWarning] = useState(null);
  const [warningForm, setWarningForm] = useState({
    userId: '',
    spLevel: '1',
    periodMonth: new Date().getMonth() + 1,
    periodYear: new Date().getFullYear(),
    reason: '',
    notes: ''
  });

  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState(null);

  // Filter
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadData();
  }, [filterYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [warningsRes, usersRes, kpiRes, statsRes] = await Promise.all([
        employeeWarningAPI.getAll({ year: filterYear }).catch(() => ({ warnings: [] })),
        userAPI.getList().catch(() => ({ users: [] })),
        kpiV2API.getData({ year: filterYear }).catch(() => ({ kpiData: [] })),
        employeeWarningAPI.getStats().catch(() => ({ stats: { sp1: 0, sp2: 0, sp3: 0, total: 0 } }))
      ]);

      setWarnings(warningsRes.warnings || []);
      setUsers(usersRes.users || []);
      setKpiSummary(kpiRes.kpiData || []);
      setStats(statsRes.stats || { sp1: 0, sp2: 0, sp3: 0, total: 0 });
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWarning = async (e) => {
    e.preventDefault();
    try {
      if (editingWarning) {
        await employeeWarningAPI.update(editingWarning.id, warningForm);
        toast.success('Surat peringatan berhasil diupdate!');
      } else {
        await employeeWarningAPI.create(warningForm);
        toast.success('Surat peringatan berhasil dibuat!');
      }
      setShowWarningModal(false);
      resetWarningForm();
      loadData();
    } catch (error) {
      console.error('Failed to save warning:', error);
      toast.error(error.message || 'Gagal menyimpan surat peringatan');
    }
  };

  const handleDeleteWarning = async () => {
    if (!deleteDialog) return;
    try {
      await employeeWarningAPI.delete(deleteDialog.id);
      toast.success('Surat peringatan berhasil dihapus!');
      setDeleteDialog(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete warning:', error);
      toast.error(error.message || 'Gagal menghapus surat peringatan');
    }
  };

  const resetWarningForm = () => {
    setWarningForm({
      userId: '',
      spLevel: '1',
      periodMonth: new Date().getMonth() + 1,
      periodYear: new Date().getFullYear(),
      reason: '',
      notes: ''
    });
    setEditingWarning(null);
  };

  const openEditWarning = (warning) => {
    setEditingWarning(warning);
    setWarningForm({
      userId: warning.userId,
      spLevel: String(warning.spLevel),
      periodMonth: warning.periodMonth,
      periodYear: warning.periodYear,
      reason: warning.reason || '',
      notes: warning.notes || ''
    });
    setShowWarningModal(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getSpBadge = (level) => {
    const sp = SP_LEVELS[level];
    if (!sp) return <Badge variant="secondary">-</Badge>;
    return <Badge className={sp.color}>{sp.label}</Badge>;
  };

  // Get employees with low KPI that might need SP (filter those with completed jobdesks and average KPI < 60)
  const lowKpiEmployees = kpiSummary.filter(emp => emp.totalJobdesks > 0 && emp.averageKpi < 60);

  const canManage = ['super_admin', 'owner', 'sdm'].includes(user.role);
  const canDelete = ['super_admin', 'owner'].includes(user.role);

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Surat Peringatan Karyawan</h1>
          <p className="text-gray-600 mt-1">Kelola surat peringatan (SP) untuk karyawan dengan kinerja rendah</p>
        </div>
        {canManage && (
          <Dialog open={showWarningModal} onOpenChange={(open) => { setShowWarningModal(open); if (!open) resetWarningForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Buat SP Baru
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingWarning ? 'Edit' : 'Buat'} Surat Peringatan</DialogTitle>
                <DialogDescription>
                  Surat peringatan diberikan kepada karyawan dengan KPI di bawah 60%
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateWarning} className="space-y-4">
                <div>
                  <Label>Karyawan *</Label>
                  <Select
                    value={warningForm.userId || 'none'}
                    onValueChange={(val) => setWarningForm({ ...warningForm, userId: val === 'none' ? '' : val })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih karyawan" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>-- Pilih Karyawan --</SelectItem>
                      {users.filter(u => u.role === 'karyawan').map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Level SP *</Label>
                    <Select
                      value={warningForm.spLevel}
                      onValueChange={(val) => setWarningForm({ ...warningForm, spLevel: val })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">SP1 - Peringatan Pertama</SelectItem>
                        <SelectItem value="2">SP2 - Peringatan Kedua</SelectItem>
                        <SelectItem value="3">SP3 - Peringatan Terakhir</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Periode</Label>
                    <div className="flex gap-2">
                      <Select
                        value={String(warningForm.periodMonth)}
                        onValueChange={(val) => setWarningForm({ ...warningForm, periodMonth: parseInt(val) })}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MONTHS.map((m, i) => (
                            <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        value={warningForm.periodYear}
                        onChange={(e) => setWarningForm({ ...warningForm, periodYear: parseInt(e.target.value) })}
                        className="w-24"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Alasan *</Label>
                  <Textarea
                    value={warningForm.reason}
                    onChange={(e) => setWarningForm({ ...warningForm, reason: e.target.value })}
                    placeholder="Jelaskan alasan pemberian surat peringatan..."
                    rows={3}
                    required
                  />
                </div>
                <div>
                  <Label>Catatan Tambahan</Label>
                  <Textarea
                    value={warningForm.notes}
                    onChange={(e) => setWarningForm({ ...warningForm, notes: e.target.value })}
                    placeholder="Catatan tambahan (opsional)..."
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setShowWarningModal(false); resetWarningForm(); }}>
                    Batal
                  </Button>
                  <Button type="submit">
                    {editingWarning ? 'Update' : 'Simpan'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold text-yellow-600">{stats.sp1}</div>
                <p className="text-sm text-gray-600">SP1 Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <div>
                <div className="text-2xl font-bold text-orange-600">{stats.sp2}</div>
                <p className="text-sm text-gray-600">SP2 Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">{stats.sp3}</div>
                <p className="text-sm text-gray-600">SP3 Aktif</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-purple-600">{lowKpiEmployees.length}</div>
                <p className="text-sm text-gray-600">KPI &lt; 60%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Label>Tahun:</Label>
        <Select value={String(filterYear)} onValueChange={(val) => setFilterYear(parseInt(val))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[2023, 2024, 2025, 2026].map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="issued">SP Terbit ({warnings.length})</TabsTrigger>
          <TabsTrigger value="candidates">
            Kandidat SP ({lowKpiEmployees.length})
            {lowKpiEmployees.length > 0 && (
              <span className="ml-1 w-2 h-2 bg-red-500 rounded-full inline-block"></span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Issued Warnings Tab */}
        <TabsContent value="issued">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Surat Peringatan</CardTitle>
            </CardHeader>
            <CardContent>
              {warnings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Tidak ada surat peringatan yang terbit untuk tahun {filterYear}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Karyawan</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Alasan</TableHead>
                        <TableHead>Tanggal Terbit</TableHead>
                        <TableHead>Diterbitkan Oleh</TableHead>
                        {canManage && <TableHead className="text-right">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warnings.map(w => (
                        <TableRow key={w.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <div>
                                <div className="font-medium">{w.userName}</div>
                                <div className="text-xs text-gray-500">{w.userEmail}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getSpBadge(w.spLevel)}</TableCell>
                          <TableCell>
                            {MONTHS[w.periodMonth - 1]} {w.periodYear}
                          </TableCell>
                          <TableCell>
                            <span className="text-sm line-clamp-2 max-w-xs">{w.reason}</span>
                          </TableCell>
                          <TableCell>{formatDate(w.createdAt)}</TableCell>
                          <TableCell>{w.issuedByName || '-'}</TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditWarning(w)}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {canDelete && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600"
                                    onClick={() => setDeleteDialog(w)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Candidates Tab */}
        <TabsContent value="candidates">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-600" />
                Karyawan dengan KPI Rendah
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lowKpiEmployees.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-green-500 mb-2" />
                  Semua karyawan memiliki KPI di atas 60%
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Karyawan</TableHead>
                        <TableHead className="text-center">Jobdesk Selesai</TableHead>
                        <TableHead className="text-center">Total Poin</TableHead>
                        <TableHead className="text-center">Rata-rata KPI</TableHead>
                        <TableHead>Status SP</TableHead>
                        {canManage && <TableHead className="text-right">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lowKpiEmployees.map(emp => (
                        <TableRow key={emp.userId} className="bg-red-50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <div>
                                <div className="font-medium">{emp.userName}</div>
                                <div className="text-xs text-gray-500">{emp.userEmail}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {emp.totalJobdesks}
                          </TableCell>
                          <TableCell className="text-center">
                            {emp.totalPoints}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-red-600 font-bold">
                              {emp.averageKpi}
                            </span>
                          </TableCell>
                          <TableCell>
                            {emp.spLevel > 0 ? (
                              getSpBadge(emp.spLevel)
                            ) : (
                              <Badge variant="outline">Belum ada SP</Badge>
                            )}
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-300"
                                onClick={() => {
                                  setWarningForm({
                                    userId: emp.userId,
                                    spLevel: String((emp.spLevel || 0) + 1),
                                    periodMonth: new Date().getMonth() + 1,
                                    periodYear: new Date().getFullYear(),
                                    reason: `Rata-rata KPI: ${emp.averageKpi} (di bawah 60)`,
                                    notes: `Total Jobdesk: ${emp.totalJobdesks}, Total Poin: ${emp.totalPoints}`
                                  });
                                  setShowWarningModal(true);
                                }}
                              >
                                <FileWarning className="w-4 h-4 mr-1" />
                                Terbitkan SP{(emp.spLevel || 0) + 1}
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDialog} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Surat Peringatan?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus surat peringatan ini? Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWarning} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
