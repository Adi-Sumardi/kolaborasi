'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { sp2dkAPI, clientAPI, jobdeskAPI } from '@/lib/api';
import { Plus, FileText, Trash2, Edit, Building2, Calendar, Clock, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Menunggu Tanggapan', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'responded', label: 'Sudah Ditanggapi', color: 'bg-green-100 text-green-800' },
  { value: 'overdue', label: 'Lewat Deadline', color: 'bg-red-100 text-red-800' },
];

export default function SP2DKPage({ user }) {
  const [notices, setNotices] = useState([]);
  const [clients, setClients] = useState([]);
  const [jobdesks, setJobdesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState('all');

  const [formData, setFormData] = useState({
    clientId: '',
    jobdeskId: '',
    letterDate: new Date().toISOString().split('T')[0],
    letterNumber: '',
    description: '',
    responseDate: '',
    status: 'pending',
  });

  const canManage = ['super_admin', 'owner', 'pengurus'].includes(user.role);

  useEffect(() => {
    loadData();
  }, [filterYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [noticesRes, clientsRes, jobdesksRes] = await Promise.all([
        sp2dkAPI.getAll({ year: filterYear }),
        clientAPI.getAll(),
        jobdeskAPI.getAll(),
      ]);
      setNotices(noticesRes.sp2dkNotices || []);
      setClients(clientsRes.clients || []);
      setJobdesks(jobdesksRes.jobdesks || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      clientId: '',
      jobdeskId: '',
      letterDate: new Date().toISOString().split('T')[0],
      letterNumber: '',
      description: '',
      responseDate: '',
      status: 'pending',
    });
  };

  // Calculate deadline (14 days from letter date)
  const calculateDeadline = (letterDate) => {
    if (!letterDate) return null;
    const date = new Date(letterDate);
    date.setDate(date.getDate() + 14);
    return date;
  };

  const isOverdue = (notice) => {
    if (notice.status === 'responded') return false;
    const deadline = calculateDeadline(notice.letterDate);
    if (!deadline) return false;
    return new Date() > deadline;
  };

  const getDaysRemaining = (notice) => {
    if (notice.status === 'responded') return null;
    const deadline = calculateDeadline(notice.letterDate);
    if (!deadline) return null;
    const now = new Date();
    const diffTime = deadline - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.clientId || !formData.letterNumber) {
      toast.error('Klien dan nomor surat wajib diisi');
      return;
    }

    try {
      await sp2dkAPI.create(formData);
      toast.success('SP2DK berhasil ditambahkan');
      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to create:', error);
      toast.error(error.message || 'Gagal menambahkan SP2DK');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedNotice) return;

    try {
      await sp2dkAPI.update(selectedNotice.id, formData);
      toast.success('SP2DK berhasil diperbarui');
      setShowEditModal(false);
      setSelectedNotice(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to update:', error);
      toast.error(error.message || 'Gagal memperbarui SP2DK');
    }
  };

  const handleDelete = async () => {
    if (!selectedNotice) return;

    try {
      await sp2dkAPI.delete(selectedNotice.id);
      toast.success('SP2DK berhasil dihapus');
      setShowDeleteDialog(false);
      setSelectedNotice(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error(error.message || 'Gagal menghapus SP2DK');
    }
  };

  const openEditModal = (notice) => {
    setSelectedNotice(notice);
    setFormData({
      clientId: notice.clientId || '',
      jobdeskId: notice.jobdeskId || '',
      letterDate: notice.letterDate ? new Date(notice.letterDate).toISOString().split('T')[0] : '',
      letterNumber: notice.letterNumber || '',
      description: notice.description || '',
      responseDate: notice.responseDate ? new Date(notice.responseDate).toISOString().split('T')[0] : '',
      status: notice.status || 'pending',
    });
    setShowEditModal(true);
  };

  // Get jobdesks for selected client
  const filteredJobdesks = formData.clientId
    ? jobdesks.filter(j => j.clientId === formData.clientId)
    : jobdesks;

  // Filter notices
  const filteredNotices = notices.filter(n => {
    const matchSearch = !searchQuery ||
      n.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.letterNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchStatus = filterStatus === 'all' ||
      (filterStatus === 'overdue' ? isOverdue(n) : n.status === filterStatus);

    return matchSearch && matchStatus;
  });

  // Summary stats
  const totalNotices = notices.length;
  const pendingCount = notices.filter(n => n.status === 'pending' && !isOverdue(n)).length;
  const respondedCount = notices.filter(n => n.status === 'responded').length;
  const overdueCount = notices.filter(n => isOverdue(n)).length;

  const getStatusBadge = (notice) => {
    if (isOverdue(notice)) {
      return <Badge className="bg-red-100 text-red-800">Lewat Deadline</Badge>;
    }
    const status = STATUS_OPTIONS.find(s => s.value === notice.status);
    return <Badge className={status?.color || 'bg-gray-100'}>{status?.label || notice.status}</Badge>;
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SP2DK</h1>
          <p className="text-gray-600 mt-1">Surat Permintaan Penjelasan atas Data dan/atau Keterangan</p>
        </div>
        {canManage && (
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Tambah SP2DK
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Tambah SP2DK</DialogTitle>
                <DialogDescription>
                  Input SP2DK dari DJP. Deadline tanggapan adalah 14 hari dari tanggal surat.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label>Klien *</Label>
                  <Select
                    value={formData.clientId || 'none'}
                    onValueChange={(val) => setFormData({ ...formData, clientId: val === 'none' ? '' : val, jobdeskId: '' })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih klien" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" disabled>-- Pilih Klien --</SelectItem>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.npwp ? `(${c.npwp})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Terkait Jobdesk (Opsional)</Label>
                  <Select
                    value={formData.jobdeskId || 'none'}
                    onValueChange={(val) => setFormData({ ...formData, jobdeskId: val === 'none' ? '' : val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jobdesk terkait" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Tidak Terkait Jobdesk --</SelectItem>
                      {filteredJobdesks.map(j => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Jika dikaitkan dengan jobdesk, akan mempengaruhi KPI karyawan (-5 poin)
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tanggal Surat *</Label>
                    <Input
                      type="date"
                      value={formData.letterDate}
                      onChange={(e) => setFormData({ ...formData, letterDate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Nomor Surat *</Label>
                    <Input
                      value={formData.letterNumber}
                      onChange={(e) => setFormData({ ...formData, letterNumber: e.target.value })}
                      placeholder="S-XXXXX/WPJ.XX/KP.XX/XXXX"
                      required
                    />
                  </div>
                </div>

                {formData.letterDate && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <Clock className="w-4 h-4 inline mr-1" />
                      Deadline Tanggapan: <strong>{calculateDeadline(formData.letterDate)?.toLocaleDateString('id-ID')}</strong>
                      <span className="text-xs ml-2">(14 hari dari tanggal surat)</span>
                    </p>
                  </div>
                )}

                <div>
                  <Label>Keterangan</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Keterangan SP2DK..."
                    rows={3}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit">Simpan</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">{totalNotices}</div>
                <p className="text-xs text-gray-600">Total SP2DK</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                <p className="text-xs text-gray-600">Menunggu Tanggapan</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">{respondedCount}</div>
                <p className="text-xs text-gray-600">Sudah Ditanggapi</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
                <p className="text-xs text-gray-600">Lewat Deadline</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Cari klien, nomor surat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-40">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="responded">Ditanggapi</SelectItem>
                  <SelectItem value="overdue">Lewat Deadline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-32">
              <Select value={String(filterYear)} onValueChange={(val) => setFilterYear(parseInt(val))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map(year => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar SP2DK - {filterYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredNotices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Tidak ada SP2DK untuk periode ini
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Nomor Surat</TableHead>
                    <TableHead>Klien</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Jobdesk Terkait</TableHead>
                    {canManage && <TableHead className="text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNotices.map(notice => {
                    const daysRemaining = getDaysRemaining(notice);
                    const deadline = calculateDeadline(notice.letterDate);

                    return (
                      <TableRow key={notice.id} className={isOverdue(notice) ? 'bg-red-50' : ''}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {new Date(notice.letterDate).toLocaleDateString('id-ID')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">
                            {notice.letterNumber}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{notice.clientName}</div>
                          {notice.clientNpwp && (
                            <div className="text-xs text-gray-500">{notice.clientNpwp}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{deadline?.toLocaleDateString('id-ID')}</span>
                            {notice.status !== 'responded' && daysRemaining !== null && (
                              <span className={`text-xs ${daysRemaining <= 0 ? 'text-red-600' : daysRemaining <= 3 ? 'text-orange-600' : 'text-gray-500'}`}>
                                {daysRemaining <= 0 ? 'Lewat ' + Math.abs(daysRemaining) + ' hari' : daysRemaining + ' hari lagi'}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(notice)}
                          {notice.responseDate && (
                            <div className="text-xs text-gray-500 mt-1">
                              Ditanggapi: {new Date(notice.responseDate).toLocaleDateString('id-ID')}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {notice.jobdeskTitle ? (
                            <Badge className="bg-blue-100 text-blue-800">
                              {notice.jobdeskTitle}
                            </Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditModal(notice)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setSelectedNotice(notice);
                                  setShowDeleteDialog(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit SP2DK</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <Label>Klien *</Label>
              <Select
                value={formData.clientId || 'none'}
                onValueChange={(val) => setFormData({ ...formData, clientId: val === 'none' ? '' : val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih klien" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>-- Pilih Klien --</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.npwp ? `(${c.npwp})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Terkait Jobdesk (Opsional)</Label>
              <Select
                value={formData.jobdeskId || 'none'}
                onValueChange={(val) => setFormData({ ...formData, jobdeskId: val === 'none' ? '' : val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih jobdesk terkait" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Tidak Terkait Jobdesk --</SelectItem>
                  {filteredJobdesks.map(j => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Surat *</Label>
                <Input
                  type="date"
                  value={formData.letterDate}
                  onChange={(e) => setFormData({ ...formData, letterDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Nomor Surat *</Label>
                <Input
                  value={formData.letterNumber}
                  onChange={(e) => setFormData({ ...formData, letterNumber: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => setFormData({ ...formData, status: val })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Menunggu Tanggapan</SelectItem>
                    <SelectItem value="responded">Sudah Ditanggapi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tanggal Tanggapan</Label>
                <Input
                  type="date"
                  value={formData.responseDate}
                  onChange={(e) => setFormData({ ...formData, responseDate: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Keterangan</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus SP2DK?</AlertDialogTitle>
            <AlertDialogDescription>
              SP2DK "{selectedNotice?.letterNumber}" akan dihapus permanen.
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
