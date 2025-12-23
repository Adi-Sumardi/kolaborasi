'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { jobdeskAPI, userAPI, dailyLogAPI, divisionAPI } from '@/lib/api';
import { Plus, Calendar, User, CheckCircle2, Clock, PlayCircle, Paperclip, Pencil, Trash2, Settings, Upload, ChevronRight, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import AttachmentSection from '@/components/AttachmentSection';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

export default function JobdeskPage({ user }) {
  const [jobdesks, setJobdesks] = useState([]);
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [selectedJobdesk, setSelectedJobdesk] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: [],
    dueDate: '',
    submissionLink: ''
  });
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    assignedTo: [],
    dueDate: '',
    submissionLink: ''
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

  // Helper function to get effective status based on assignments
  // If any user completed, status should be 'in_progress' not 'pending'
  const getEffectiveStatus = (job) => {
    // Use new assignments data if available
    if (job.assignments && job.assignments.length > 0) {
      const completedCount = job.assignments.filter(a => a.userStatus === 'completed').length;
      const totalAssigned = job.assignments.length;

      if (completedCount === totalAssigned && totalAssigned > 0) {
        return 'completed';
      }

      const anyProgress = job.assignments.some(a => a.userStatus === 'completed' || a.userStatus === 'in_progress');
      if (anyProgress && job.status === 'pending') {
        return 'in_progress';
      }

      return job.status;
    }

    // Fallback to old progress data for backward compatibility
    if (!job.progress || job.progress.length === 0) {
      return job.status;
    }

    const completedCount = job.progress.filter(p => p.status === 'completed').length;
    const totalAssigned = job.assignedTo?.length || 0;

    // If all completed, status is completed
    if (completedCount === totalAssigned && totalAssigned > 0) {
      return 'completed';
    }

    // If any completed or in_progress, status is in_progress (not pending)
    const anyProgress = job.progress.some(p => p.status === 'completed' || p.status === 'in_progress');
    if (anyProgress && job.status === 'pending') {
      return 'in_progress';
    }

    return job.status;
  };

  // Helper function to get user progress details for tooltip
  const getUserProgressDetails = (job) => {
    // Use new assignments data if available
    if (job.assignments && job.assignments.length > 0) {
      return job.assignments.map(assignment => ({
        userId: assignment.userId,
        name: assignment.userName || 'Unknown User',
        email: assignment.userEmail,
        status: assignment.userStatus || 'pending',
        completedAt: assignment.completedAt,
        attachmentCount: assignment.attachmentCount || 0
      }));
    }

    // Fallback to old progress data for backward compatibility
    if (!job.progress || !job.assignedTo) return [];

    return job.assignedTo.map(userId => {
      const userInfo = users.find(u => u.id === userId);
      const progress = job.progress.find(p => p.userId === userId);

      return {
        userId,
        name: userInfo?.name || 'Unknown User',
        status: progress?.status || 'pending',
        updatedAt: progress?.updatedAt
      };
    });
  };

  // Helper function to get status label in Indonesian
  const getStatusLabel = (status) => {
    switch (status) {
      case 'completed': return 'Selesai';
      case 'in_progress': return 'Dalam Proses';
      case 'pending': return 'Pending';
      default: return status;
    }
  };

  // Helper function to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100';
      case 'pending': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

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

    // For karyawan, auto-assign to themselves
    const jobdeskData = user.role === 'karyawan' 
      ? { ...formData, assignedTo: [user.id] }
      : formData;

    // Validation for admin/pengurus only
    if ((user.role === 'super_admin' || user.role === 'pengurus') && jobdeskData.assignedTo.length === 0) {
      toast.error('Pilih minimal satu karyawan');
      return;
    }

    try {
      await jobdeskAPI.create(jobdeskData);
      toast.success('Jobdesk berhasil dibuat!');
      setShowCreateModal(false);
      setFormData({ title: '', description: '', assignedTo: [], dueDate: '', submissionLink: '' });
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

  const handleEditJobdesk = async (e) => {
    e.preventDefault();

    // Only validate assignedTo for super_admin and pengurus
    if ((user.role === 'super_admin' || user.role === 'pengurus') && editFormData.assignedTo.length === 0) {
      toast.error('Pilih minimal satu karyawan');
      return;
    }

    try {
      // For karyawan, remove assignedTo from the update payload
      const updateData = user.role === 'karyawan'
        ? { title: editFormData.title, description: editFormData.description, dueDate: editFormData.dueDate, submissionLink: editFormData.submissionLink }
        : editFormData;
      
      await jobdeskAPI.update(selectedJobdesk.id, updateData);
      toast.success('Jobdesk berhasil diperbarui!');
      setShowEditModal(false);
      setEditFormData({ title: '', description: '', assignedTo: [], dueDate: '', submissionLink: '' });
      setSelectedJobdesk(null);
      loadData();
    } catch (error) {
      console.error('Failed to update jobdesk:', error);
      toast.error(error.message || 'Gagal memperbarui jobdesk');
    }
  };

  const handleDeleteJobdesk = async () => {
    try {
      await jobdeskAPI.delete(selectedJobdesk.id);
      toast.success('Jobdesk berhasil dihapus!');
      setShowDeleteDialog(false);
      setSelectedJobdesk(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete jobdesk:', error);
      toast.error(error.message || 'Gagal menghapus jobdesk');
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

  const toggleUserSelection = (userId, isEditMode = false) => {
    if (isEditMode) {
      setEditFormData(prev => ({
        ...prev,
        assignedTo: prev.assignedTo.includes(userId)
          ? prev.assignedTo.filter(id => id !== userId)
          : [...prev.assignedTo, userId]
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        assignedTo: prev.assignedTo.includes(userId)
          ? prev.assignedTo.filter(id => id !== userId)
          : [...prev.assignedTo, userId]
      }));
    }
  };

  const selectAllKaryawan = (isEditMode = false) => {
    const karyawanIds = users.filter(u => u.role === 'karyawan').map(u => u.id);
    if (isEditMode) {
      setEditFormData(prev => ({ ...prev, assignedTo: karyawanIds }));
    } else {
      setFormData(prev => ({ ...prev, assignedTo: karyawanIds }));
    }
  };
  
  const selectAllFiltered = (isEditMode = false) => {
    const filteredIds = getFilteredUsers().map(u => u.id);
    if (isEditMode) {
      setEditFormData(prev => ({ ...prev, assignedTo: filteredIds }));
    } else {
      setFormData(prev => ({ ...prev, assignedTo: filteredIds }));
    }
  };
  
  const clearSelection = (isEditMode = false) => {
    if (isEditMode) {
      setEditFormData(prev => ({ ...prev, assignedTo: [] }));
    } else {
      setFormData(prev => ({ ...prev, assignedTo: [] }));
    }
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
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Jobdesk</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Kelola tugas dan pekerjaan</p>
        </div>
        <Dialog open={showCreateModal} onOpenChange={(open) => {
          setShowCreateModal(open);
          if (!open) {
            // Reset form data saat modal ditutup
            setFormData({ title: '', description: '', assignedTo: [], dueDate: '' });
            setSearchQuery('');
            setDivisionFilter('all');
            setStatusFilter('active');
          }
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              {user.role === 'karyawan' ? 'Tambah Jobdesk Saya' : 'Tambah Jobdesk'}
            </Button>
          </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
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
                
                {/* Submission Link - only for super_admin and pengurus */}
                {(user.role === 'super_admin' || user.role === 'pengurus') && (
                  <div>
                    <Label htmlFor="submissionLink">Link Pengumpulan (Opsional)</Label>
                    <Input
                      id="submissionLink"
                      type="url"
                      placeholder="https://drive.google.com/... atau https://forms.gle/..."
                      value={formData.submissionLink}
                      onChange={(e) => setFormData({ ...formData, submissionLink: e.target.value })}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Link untuk karyawan mengumpulkan file (Google Drive, Google Form, dll)
                    </p>
                  </div>
                )}
                
                {/* AssignTo section - only for super_admin and pengurus */}
                {(user.role === 'super_admin' || user.role === 'pengurus') && (
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
                )}
                
                {/* Info for karyawan */}
                {user.role === 'karyawan' && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Info:</strong> Jobdesk ini akan otomatis di-assign ke Anda.
                    </p>
                  </div>
                )}
                
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit">Buat Jobdesk</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
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
          jobdesks.map(job => {
            // Get user's personal status from assignments array (new) or progress array (old)
            const userAssignment = job.assignments?.find(a => a.userId === user.id);
            const userProgress = job.progress?.find(p => p.userId === user.id);
            const userStatus = userAssignment?.userStatus || userProgress?.status || job.status; // Fallback to global status for old data

            // Get counts for progress display
            const completedCount = job.completedCount ?? job.assignments?.filter(a => a.userStatus === 'completed').length ?? 0;
            const totalAssignees = job.totalAssignees ?? job.assignments?.length ?? job.assignedTo?.length ?? 0;

            return (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{job.title}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{job.description}</p>
                  </div>
                  <div className="ml-4 flex flex-col gap-2">
                    {/* Show user's personal status for karyawan */}
                    {user.role === 'karyawan' && job.assignedTo?.includes(user.id) ? (
                      <>
                        {userStatus === 'pending' && (
                          <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full">
                            Belum Mulai
                          </span>
                        )}
                        {userStatus === 'in_progress' && (
                          <span className="px-3 py-1 bg-yellow-200 text-yellow-700 text-sm rounded-full">
                            Sedang Dikerjakan
                          </span>
                        )}
                        {userStatus === 'completed' && (
                          <span className="px-3 py-1 bg-green-200 text-green-700 text-sm rounded-full">
                            ✓ Selesai
                          </span>
                        )}
                      </>
                    ) : (
                      // Show effective status for admin/pengurus (based on progress)
                      <>
                        {(() => {
                          const effectiveStatus = getEffectiveStatus(job);
                          return (
                            <>
                              {effectiveStatus === 'pending' && (
                                <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full">
                                  Pending
                                </span>
                              )}
                              {effectiveStatus === 'in_progress' && (
                                <span className="px-3 py-1 bg-yellow-200 text-yellow-700 text-sm rounded-full">
                                  Dalam Proses
                                </span>
                              )}
                              {effectiveStatus === 'completed' && (
                                <span className="px-3 py-1 bg-green-200 text-green-700 text-sm rounded-full">
                                  Selesai
                                </span>
                              )}
                            </>
                          );
                        })()}
                        {/* Show progress count with HoverCard tooltip for admin/pengurus */}
                        {totalAssignees > 0 && (
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer bg-blue-50 px-2 py-1 rounded-full text-center font-medium">
                                <Users className="w-3 h-3 inline mr-1" />
                                {completedCount}/{totalAssignees} selesai
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80" align="end">
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-gray-500" />
                                  <h4 className="text-sm font-semibold">Status Progress Karyawan</h4>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {getUserProgressDetails(job).map((detail, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-50">
                                      <div className="flex-1 min-w-0">
                                        <span className="text-sm text-gray-700 truncate block" title={detail.name}>
                                          {detail.name}
                                        </span>
                                        {detail.completedAt && (
                                          <span className="text-xs text-gray-500">
                                            Selesai: {new Date(detail.completedAt).toLocaleDateString('id-ID')}
                                          </span>
                                        )}
                                      </div>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${getStatusColor(detail.status)}`}>
                                        {detail.status === 'completed' && '✓ '}
                                        {getStatusLabel(detail.status)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="pt-2 border-t text-xs text-gray-500">
                                  {completedCount} dari {totalAssignees} karyawan selesai
                                </div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-gray-600">
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
                  
                  {/* Submission Link */}
                  {job.submissionLink && (
                    <a
                      href={job.submissionLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline bg-blue-50 px-3 py-2 rounded-lg"
                    >
                      <Upload className="w-4 h-4" />
                      <span className="font-medium">Link Pengumpulan Tugas</span>
                      <ChevronRight className="w-4 h-4" />
                    </a>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedJobdesk(job);
                        setShowAttachmentModal(true);
                      }}
                      className="flex-1 sm:flex-none"
                    >
                      <Paperclip className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Lampiran</span>
                      <span className="sm:hidden">File</span>
                    </Button>
                    
                    {/* Settings dropdown - for super_admin, pengurus, and karyawan (for their own jobdesk) */}
                    {(user.role === 'super_admin' || user.role === 'pengurus' || (user.role === 'karyawan' && job.assignedTo?.includes(user.id))) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 sm:flex-none"
                          >
                            <Settings className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Pengaturan</span>
                            <span className="sm:hidden">⚙️</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {/* Edit option - for super_admin, pengurus, and karyawan (their own jobdesk) */}
                          {(user.role === 'super_admin' || user.role === 'pengurus' || (user.role === 'karyawan' && job.assignedTo?.includes(user.id))) && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedJobdesk(job);
                                setEditFormData({
                                  title: job.title,
                                  description: job.description || '',
                                  assignedTo: job.assignedTo || [],
                                  dueDate: job.dueDate ? new Date(job.dueDate).toISOString().split('T')[0] : '',
                                  submissionLink: job.submissionLink || ''
                                });
                                setShowEditModal(true);
                              }}
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit Jobdesk
                            </DropdownMenuItem>
                          )}
                          
                          {/* Delete option - only for super_admin */}
                          {user.role === 'super_admin' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedJobdesk(job);
                                  setShowDeleteDialog(true);
                                }}
                                className="text-red-600 focus:text-red-700 focus:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Hapus Jobdesk
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    
                    {user.role === 'karyawan' && job.assignedTo?.includes(user.id) && userStatus === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus(job.id, 'in_progress')}
                        className="flex-1 sm:flex-none"
                      >
                        <PlayCircle className="w-4 h-4 mr-1" />
                        Mulai
                      </Button>
                    )}
                    {user.role === 'karyawan' && job.assignedTo?.includes(user.id) && userStatus === 'in_progress' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedJobdesk(job);
                            setShowLogModal(true);
                          }}
                          className="flex-1 sm:flex-none"
                        >
                          <Clock className="w-4 h-4 mr-1" />
                          <span className="hidden sm:inline">Log Aktivitas</span>
                          <span className="sm:hidden">Log</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUpdateStatus(job.id, 'completed')}
                          className="flex-1 sm:flex-none"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Selesai
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>
      
      {/* Attachment Modal */}
      <Dialog open={showAttachmentModal} onOpenChange={setShowAttachmentModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Lampiran - {selectedJobdesk?.title}</DialogTitle>
            <DialogDescription>
              Upload file atau tambahkan link untuk jobdesk ini
            </DialogDescription>
          </DialogHeader>
          {selectedJobdesk && (
            <AttachmentSection jobdesk={selectedJobdesk} user={user} />
          )}
        </DialogContent>
      </Dialog>

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

      {/* Edit Jobdesk Modal */}
      <Dialog open={showEditModal} onOpenChange={(open) => {
        setShowEditModal(open);
        if (!open) {
          setSearchQuery('');
          setDivisionFilter('all');
          setStatusFilter('active');
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>Edit Jobdesk</DialogTitle>
            <DialogDescription>
              Perbarui informasi jobdesk
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditJobdesk} className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Judul Jobdesk *</Label>
              <Input
                id="edit-title"
                value={editFormData.title}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Deskripsi</Label>
              <Textarea
                id="edit-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-dueDate">Tenggat Waktu</Label>
              <Input
                id="edit-dueDate"
                type="date"
                value={editFormData.dueDate}
                onChange={(e) => setEditFormData({ ...editFormData, dueDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-submissionLink">Link Pengumpulan (Opsional)</Label>
              <Input
                id="edit-submissionLink"
                type="url"
                placeholder="https://drive.google.com/..."
                value={editFormData.submissionLink}
                onChange={(e) => setEditFormData({ ...editFormData, submissionLink: e.target.value })}
              />
            </div>

            {/* AssignedTo field - only for super_admin and pengurus */}
            {(user.role === 'super_admin' || user.role === 'pengurus') && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Assign ke Karyawan *</Label>
                  <div className="flex space-x-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => selectAllFiltered(true)}>
                      Pilih Semua (Filter)
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => clearSelection(true)}>
                      Clear
                    </Button>
                  </div>
                </div>
              
              {/* Filter Section */}
              <div className="space-y-3 mb-3 p-3 bg-gray-50 rounded-lg border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="edit-search" className="text-xs">Cari Nama/Email</Label>
                    <Input
                      id="edit-search"
                      type="text"
                      placeholder="Cari karyawan..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="edit-division-filter" className="text-xs">Filter Divisi</Label>
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
                  
                  <div>
                    <Label htmlFor="edit-status-filter" className="text-xs">Filter Status</Label>
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
              </div>
              
              <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
                {getFilteredUsers().length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Tidak ada karyawan yang sesuai dengan filter
                  </p>
                ) : (
                  getFilteredUsers().map(u => (
                    <div key={u.id} className="flex items-center">
                      <Checkbox
                        id={`edit-user-${u.id}`}
                        checked={editFormData.assignedTo.includes(u.id)}
                        onCheckedChange={() => toggleUserSelection(u.id, true)}
                      />
                      <Label
                        htmlFor={`edit-user-${u.id}`}
                        className="ml-2 flex-1 cursor-pointer hover:bg-gray-50 p-2 rounded"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{u.name}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                            {u.divisionId && (
                              <div className="text-xs text-blue-600">
                                {divisions.find(d => d.id === u.divisionId)?.name}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {!u.divisionId && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                No Div
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
                {editFormData.assignedTo.length} karyawan dipilih
              </p>
            </div>
            )}
            
            {/* For karyawan - show info that they cannot change assignedTo */}
            {user.role === 'karyawan' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Info:</strong> Karyawan hanya bisa mengubah judul, deskripsi, dan tenggat waktu. 
                  Untuk mengubah karyawan yang ditugaskan, hubungi admin atau pengurus.
                </p>
              </div>
            )}
            
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Batal
              </Button>
              <Button type="submit">Simpan Perubahan</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Jobdesk?</AlertDialogTitle>
            <AlertDialogDescription>
              Anda yakin ingin menghapus jobdesk <strong>{selectedJobdesk?.title}</strong>?
              <br /><br />
              <span className="text-red-600 font-medium">
                Peringatan: Ini akan menghapus semua lampiran terkait dan memutus hubungan dengan to-do dan daily log.
                Tindakan ini tidak dapat dibatalkan.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteJobdesk}
              className="bg-red-600 hover:bg-red-700"
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}