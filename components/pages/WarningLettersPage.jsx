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
import { warningLetterAPI, clientAPI, jobdeskAPI } from '@/lib/api';
import { Plus, FileWarning, Trash2, Edit, Building2, Calendar, DollarSign, Search, Filter } from 'lucide-react';

export default function WarningLettersPage({ user }) {
  const [letters, setLetters] = useState([]);
  const [clients, setClients] = useState([]);
  const [jobdesks, setJobdesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const [formData, setFormData] = useState({
    clientId: '',
    jobdeskId: '',
    letterDate: new Date().toISOString().split('T')[0],
    letterNumber: '',
    description: '',
    fineAmount: 0,
  });

  const canManage = ['super_admin', 'owner', 'pengurus'].includes(user.role);

  useEffect(() => {
    loadData();
  }, [filterYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [lettersRes, clientsRes, jobdesksRes] = await Promise.all([
        warningLetterAPI.getAll({ year: filterYear }),
        clientAPI.getAll(),
        jobdeskAPI.getAll(),
      ]);
      setLetters(lettersRes.warningLetters || []);
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
      fineAmount: 0,
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.clientId || !formData.letterNumber) {
      toast.error('Klien dan nomor surat wajib diisi');
      return;
    }

    try {
      await warningLetterAPI.create(formData);
      toast.success('Surat Teguran berhasil ditambahkan');
      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to create:', error);
      toast.error(error.message || 'Gagal menambahkan surat teguran');
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!selectedLetter) return;

    try {
      await warningLetterAPI.update(selectedLetter.id, formData);
      toast.success('Surat Teguran berhasil diperbarui');
      setShowEditModal(false);
      setSelectedLetter(null);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to update:', error);
      toast.error(error.message || 'Gagal memperbarui surat teguran');
    }
  };

  const handleDelete = async () => {
    if (!selectedLetter) return;

    try {
      await warningLetterAPI.delete(selectedLetter.id);
      toast.success('Surat Teguran berhasil dihapus');
      setShowDeleteDialog(false);
      setSelectedLetter(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error(error.message || 'Gagal menghapus surat teguran');
    }
  };

  const openEditModal = (letter) => {
    setSelectedLetter(letter);
    setFormData({
      clientId: letter.clientId || '',
      jobdeskId: letter.jobdeskId || '',
      letterDate: letter.letterDate ? new Date(letter.letterDate).toISOString().split('T')[0] : '',
      letterNumber: letter.letterNumber || '',
      description: letter.description || '',
      fineAmount: letter.fineAmount || 0,
    });
    setShowEditModal(true);
  };

  // Get jobdesks for selected client
  const filteredJobdesks = formData.clientId
    ? jobdesks.filter(j => j.clientId === formData.clientId)
    : jobdesks;

  // Filter letters by search
  const filteredLetters = letters.filter(l => {
    const matchSearch = !searchQuery ||
      l.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.letterNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  // Summary stats
  const totalLetters = letters.length;
  const totalFines = letters.reduce((sum, l) => sum + (l.fineAmount || 0), 0);

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Surat Teguran DJP</h1>
          <p className="text-gray-600 mt-1">Kelola surat teguran dari Direktorat Jenderal Pajak</p>
        </div>
        {canManage && (
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Surat Teguran
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Tambah Surat Teguran</DialogTitle>
                <DialogDescription>
                  Input surat teguran dari DJP untuk klien
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
                      placeholder="ST-XXX/WPJ.XX/KP.XX/XXXX"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label>Denda (Rp)</Label>
                  <Input
                    type="number"
                    value={formData.fineAmount}
                    onChange={(e) => setFormData({ ...formData, fineAmount: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>

                <div>
                  <Label>Keterangan</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Keterangan surat teguran..."
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileWarning className="w-5 h-5 text-orange-600" />
              <div>
                <div className="text-2xl font-bold text-orange-600">{totalLetters}</div>
                <p className="text-xs text-gray-600">Total Surat Teguran</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {totalFines.toLocaleString('id-ID')}
                </div>
                <p className="text-xs text-gray-600">Total Denda (Rp)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {new Set(letters.map(l => l.clientId)).size}
                </div>
                <p className="text-xs text-gray-600">Klien Terkena</p>
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
          <CardTitle>Daftar Surat Teguran - {filterYear}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredLetters.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Tidak ada surat teguran untuk periode ini
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Nomor Surat</TableHead>
                    <TableHead>Klien</TableHead>
                    <TableHead>Jobdesk Terkait</TableHead>
                    <TableHead className="text-right">Denda</TableHead>
                    <TableHead>Keterangan</TableHead>
                    {canManage && <TableHead className="text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLetters.map(letter => (
                    <TableRow key={letter.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {new Date(letter.letterDate).toLocaleDateString('id-ID')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {letter.letterNumber}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{letter.clientName}</div>
                        {letter.clientNpwp && (
                          <div className="text-xs text-gray-500">{letter.clientNpwp}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {letter.jobdeskTitle ? (
                          <Badge className="bg-blue-100 text-blue-800">
                            {letter.jobdeskTitle}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {letter.fineAmount > 0 ? (
                          <span className="text-red-600 font-medium">
                            Rp {letter.fineAmount.toLocaleString('id-ID')}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate" title={letter.description}>
                          {letter.description || '-'}
                        </div>
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditModal(letter)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setSelectedLetter(letter);
                                setShowDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
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

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Surat Teguran</DialogTitle>
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

            <div>
              <Label>Denda (Rp)</Label>
              <Input
                type="number"
                value={formData.fineAmount}
                onChange={(e) => setFormData({ ...formData, fineAmount: parseInt(e.target.value) || 0 })}
              />
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
            <AlertDialogTitle>Hapus Surat Teguran?</AlertDialogTitle>
            <AlertDialogDescription>
              Surat teguran "{selectedLetter?.letterNumber}" akan dihapus permanen.
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
