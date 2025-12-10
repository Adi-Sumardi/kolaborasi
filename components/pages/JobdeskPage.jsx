'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { jobdeskAPI, userAPI, dailyLogAPI, divisionAPI } from '@/lib/api';
import { Plus, Calendar, User, CheckCircle2, Clock, PlayCircle, Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import AttachmentSection from '@/components/AttachmentSection';

export default function JobdeskPage({ user }) {
  const [jobdesks, setJobdesks] = useState([]);
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [selectedJobdesk, setSelectedJobdesk] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: [],
    dueDate: ''
  });
  const [logData, setLogData] = useState({
    notes: '',
    hoursSpent: 0,
    date: new Date().toISOString().split('T')[0]
  });
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const promises = [
        jobdeskAPI.getAll(),
        user.role !== 'karyawan' ? userAPI.getAll() : Promise.resolve({ users: [] })
      ];
      
      if (user.role !== 'karyawan') {
        promises.push(divisionAPI.getAll());
      }

      const results = await Promise.all(promises);
      
      setJobdesks(results[0].jobdesks || []);
      setUsers(results[1].users || []);
      if (results[2]) {
        setDivisions(results[2].divisions || []);
      }
    } catch (error) {
      console.error('Failed to load jobdesks:', error);
      toast.error('Gagal memuat data jobdesk');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateJobdesk = async (e) => {
    e.preventDefault();

    if (formData.assignedTo.length === 0) {
      toast.error('Pilih minimal satu karyawan');
      return;
    }

    try {
      await jobdeskAPI.create(formData);
      toast.success('Jobdesk berhasil dibuat!');
      setShowCreateModal(false);
      setFormData({ title: '', description: '', assignedTo: [], dueDate: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create jobdesk:', error);
      toast.error(error.message || 'Gagal membuat jobdesk');
    }
  };

  const handleUpdateStatus = async (jobdeskId, newStatus) => {
    try {
      await jobdeskAPI.updateStatus(jobdeskId, newStatus);
      toast.success('Status jobdesk diperbarui');
      loadData();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Gagal memperbarui status');
    }
  };

  const handleCreateLog = async (e) => {
    e.preventDefault();

    try {
      await dailyLogAPI.create({
        ...logData,
        jobdeskId: selectedJobdesk.id
      });
      toast.success('Log aktivitas berhasil ditambahkan!');
      setShowLogModal(false);
      setLogData({ notes: '', hoursSpent: 0, date: new Date().toISOString().split('T')[0] });
      setSelectedJobdesk(null);
    } catch (error) {
      console.error('Failed to create log:', error);
      toast.error('Gagal menambahkan log');
    }
  };

  const toggleUserSelection = (userId) => {
    setFormData(prev => ({
      ...prev,
      assignedTo: prev.assignedTo.includes(userId)
        ? prev.assignedTo.filter(id => id !== userId)
        : [...prev.assignedTo, userId]
    }));
  };

  const selectAllKaryawan = () => {
    const karyawanIds = users.filter(u => u.role === 'karyawan').map(u => u.id);
    setFormData(prev => ({ ...prev, assignedTo: karyawanIds }));
  };
  
  const selectAllFiltered = () => {
    const filteredIds = getFilteredUsers().map(u => u.id);
    setFormData(prev => ({ ...prev, assignedTo: filteredIds }));
  };
  
  const clearSelection = () => {
    setFormData(prev => ({ ...prev, assignedTo: [] }));
  };
  
  // Filter function
  const getFilteredUsers = () => {
    let filtered = users.filter(u => u.role === 'karyawan');
    
    // Filter by search query (nama atau email)
    if (searchQuery) {
      filtered = filtered.filter(u => 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Filter by division
    if (divisionFilter !== 'all') {
      if (divisionFilter === 'no_division') {
        filtered = filtered.filter(u => !u.divisionId);
      } else {
        filtered = filtered.filter(u => u.divisionId === divisionFilter);
      }
    }
    
    // Filter by status
    if (statusFilter === 'active') {
      filtered = filtered.filter(u => u.isActive !== false);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter(u => u.isActive === false);
    }
    
    return filtered;
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Jobdesk</h1>
          <p className="text-gray-600 mt-1">Kelola tugas dan pekerjaan</p>
        </div>
        {(user.role === 'super_admin' || user.role === 'pengurus') && (
          <Dialog open={showCreateModal} onOpenChange={(open) => {
            setShowCreateModal(open);
            if (!open) {
              // Reset filter saat modal ditutup
              setSearchQuery('');
              setDivisionFilter('all');
              setStatusFilter('active');
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Jobdesk
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tambah Jobdesk Baru</DialogTitle>
                <DialogDescription>
                  Buat jobdesk baru dan assign ke karyawan
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateJobdesk} className="space-y-4">
                <div>
                  <Label htmlFor="title">Judul Jobdesk *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Deskripsi</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="dueDate">Tenggat Waktu</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Assign ke Karyawan *</Label>
                    <div className="flex space-x-2">
                      <Button type="button" variant="outline" size="sm" onClick={selectAllFiltered}>
                        Pilih Semua (Filter)
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  
                  {/* Filter Section */}
                  <div className="space-y-3 mb-3 p-3 bg-gray-50 rounded-lg border">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Search Filter */}
                      <div>
                        <Label htmlFor="search" className="text-xs">Cari Nama/Email</Label>
                        <Input
                          id="search"
                          type="text"
                          placeholder="Cari karyawan..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-9"
                        />
                      </div>
                      
                      {/* Division Filter */}
                      <div>
                        <Label htmlFor="division-filter" className="text-xs">Filter Divisi</Label>
                        <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Divisi</SelectItem>
                            <SelectItem value="no_division">Tanpa Divisi</SelectItem>
                            {divisions.map(div => (
                              <SelectItem key={div.id} value={div.id}>
                                {div.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Status Filter */}
                      <div>
                        <Label htmlFor="status-filter" className="text-xs">Filter Status</Label>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Semua Status</SelectItem>
                            <SelectItem value="active">Aktif</SelectItem>
                            <SelectItem value="inactive">Nonaktif</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>
                        Menampilkan {getFilteredUsers().length} dari {users.filter(u => u.role === 'karyawan').length} karyawan
                      </span>
                      {(searchQuery || divisionFilter !== 'all' || statusFilter !== 'all') && (
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setSearchQuery('');
                            setDivisionFilter('all');
                            setStatusFilter('active');
                          }}
                          className="h-7 text-xs"
                        >
                          Reset Filter
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {/* User List */}
                  <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                    {getFilteredUsers().length === 0 ? (
                      <p className="text-center text-gray-500 py-4">
                        Tidak ada karyawan yang sesuai dengan filter
                      </p>
                    ) : (
                      getFilteredUsers().map(u => (
                        <div key={u.id} className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                          <Checkbox
                            id={`user-${u.id}`}
                            checked={formData.assignedTo.includes(u.id)}
                            onCheckedChange={() => toggleUserSelection(u.id)}
                          />
                          <Label htmlFor={`user-${u.id}`} className="cursor-pointer flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{u.name}</p>
                                <p className="text-xs text-gray-500">{u.email}</p>
                              </div>
                              <div className="flex items-center space-x-2">
                                {u.divisionId && divisions.find(d => d.id === u.divisionId) && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                    {divisions.find(d => d.id === u.divisionId)?.name}
                                  </span>
                                )}
                                {u.isActive === false && (
                                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                                    Nonaktif
                                  </span>
                                )}
                              </div>
                            </div>
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    {formData.assignedTo.length} karyawan dipilih
                  </p>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit">Buat Jobdesk</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Jobdesk List */}
      <div className="grid gap-4">
        {jobdesks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              Belum ada jobdesk
            </CardContent>
          </Card>
        ) : (
          jobdesks.map(job => (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{job.title}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{job.description}</p>
                  </div>
                  <div className="ml-4">
                    {job.status === 'pending' && (
                      <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full">
                        Pending
                      </span>
                    )}
                    {job.status === 'in_progress' && (
                      <span className="px-3 py-1 bg-yellow-200 text-yellow-700 text-sm rounded-full">
                        Dalam Proses
                      </span>
                    )}
                    {job.status === 'completed' && (
                      <span className="px-3 py-1 bg-green-200 text-green-700 text-sm rounded-full">
                        Selesai
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    {job.dueDate && (
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(job.dueDate).toLocaleDateString('id-ID')}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-1">
                      <User className="w-4 h-4" />
                      <span>{job.assignedTo?.length || 0} karyawan</span>
                    </div>
                  </div>
                  {user.role === 'karyawan' && job.assignedTo?.includes(user.id) && (
                    <div className="flex space-x-2">
                      {job.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateStatus(job.id, 'in_progress')}
                        >
                          <PlayCircle className="w-4 h-4 mr-1" />
                          Mulai
                        </Button>
                      )}
                      {job.status === 'in_progress' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedJobdesk(job);
                              setShowLogModal(true);
                            }}
                          >
                            <Clock className="w-4 h-4 mr-1" />
                            Log Aktivitas
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(job.id, 'completed')}
                          >
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            Selesai
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Log Activity Modal */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Aktivitas Harian</DialogTitle>
            <DialogDescription>
              Catat progress pekerjaan Anda untuk jobdesk: {selectedJobdesk?.title}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateLog} className="space-y-4">
            <div>
              <Label htmlFor="log-date">Tanggal</Label>
              <Input
                id="log-date"
                type="date"
                value={logData.date}
                onChange={(e) => setLogData({ ...logData, date: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="log-hours">Jam Kerja</Label>
              <Input
                id="log-hours"
                type="number"
                step="0.5"
                min="0"
                value={logData.hoursSpent}
                onChange={(e) => setLogData({ ...logData, hoursSpent: parseFloat(e.target.value) })}
                required
              />
            </div>
            <div>
              <Label htmlFor="log-notes">Catatan Progress *</Label>
              <Textarea
                id="log-notes"
                value={logData.notes}
                onChange={(e) => setLogData({ ...logData, notes: e.target.value })}
                rows={4}
                placeholder="Deskripsikan progress yang sudah dicapai hari ini..."
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowLogModal(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Log</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}