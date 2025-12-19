'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { jobdeskAPI, userAPI, dailyLogAPI, divisionAPI, clientAPI } from '@/lib/api';
import { Plus, Calendar, User, CheckCircle2, Clock, PlayCircle, Paperclip, Pencil, Trash2, Settings, Upload, ChevronRight, Users, Building2, FileText, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
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

// Task types configuration
const TASK_TYPES = [
  { id: 'pph_21', label: 'PPh 21', description: 'Pajak Penghasilan Pasal 21' },
  { id: 'pph_unifikasi', label: 'PPh Unifikasi', description: 'PPh 15, 22, 23, 26, 4(2)' },
  { id: 'pph_25', label: 'PPh 25 Angsuran', description: 'Pajak Penghasilan Pasal 25 Angsuran' },
  { id: 'ppn', label: 'PPN', description: 'Pajak Pertambahan Nilai' },
  { id: 'pph_badan', label: 'PPh Badan', description: 'Pajak Penghasilan Badan' },
  { id: 'pph_05', label: 'PPh 0,5%', description: 'PPh Final 0,5% (UMKM)' },
];

// Helper function to calculate deadline based on task type and period
const calculateTaskDeadline = (taskType, periodMonth, periodYear) => {
  if (!periodMonth || !periodYear) return null;

  // Calculate next month
  let nextMonth = periodMonth + 1;
  let nextYear = periodYear;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }

  if (taskType === 'ppn') {
    // PPN: Tanggal 28 + 7 hari di bulan berikutnya
    const startDate = new Date(nextYear, nextMonth - 1, 28);
    startDate.setDate(startDate.getDate() + 7);
    return startDate;
  } else {
    // PPh types: Tanggal 20 bulan berikutnya
    return new Date(nextYear, nextMonth - 1, 20);
  }
};

// Check if deadline has passed
const isDeadlinePassed = (deadline) => {
  if (!deadline) return false;
  const now = new Date();
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(23, 59, 59, 999);
  return now > deadlineDate;
};

// Format date for display
const formatDeadlineDate = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

// Default task types (all selected)
const DEFAULT_TASK_TYPES = TASK_TYPES.map(t => t.id);

export default function JobdeskPage({ user }) {
  const [jobdesks, setJobdesks] = useState([]);
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedJobdesk, setSelectedJobdesk] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: [],
    dueDate: '',
    submissionLink: '',
    // New fields
    clientId: '',
    newClient: null,
    periodMonth: new Date().getMonth() + 1,
    periodYear: new Date().getFullYear(),
    taskTypes: DEFAULT_TASK_TYPES
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
  const [submissionForm, setSubmissionForm] = useState({
    submissionType: 'link',
    title: '',
    content: '',
    taskType: '',
    notes: ''
  });

  // Track which task type is being edited for inline form
  const [activeTaskTypeForm, setActiveTaskTypeForm] = useState(null);
  const [inlineForm, setInlineForm] = useState({
    submissionType: 'link',
    content: '',
    notes: '',
    file: null
  });
  const [uploadingFile, setUploadingFile] = useState(false);

  // Client creation mode
  const [clientMode, setClientMode] = useState('existing'); // 'existing' or 'new'
  const [newClientData, setNewClientData] = useState({
    name: '',
    groupName: '',
    npwp: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    isPkp: false,
    isUmkm: true
  });

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');

  // Helper function to get effective status based on progress
  // If any user completed, status should be 'in_progress' not 'pending'
  const getEffectiveStatus = (job) => {
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

  // Helper function to check if jobdesk is overdue
  const isOverdue = (job) => {
    if (!job.dueDate) return false;
    if (job.status === 'completed') return false;
    const now = new Date();
    const dueDate = new Date(job.dueDate);
    // Set time to end of day for comparison
    dueDate.setHours(23, 59, 59, 999);
    return now > dueDate;
  };

  // Helper function to check if jobdesk was completed late
  const wasCompletedLate = (job) => {
    if (!job.dueDate || job.status !== 'completed') return false;
    if (!job.updatedAt) return false;
    const completedDate = new Date(job.updatedAt);
    const dueDate = new Date(job.dueDate);
    dueDate.setHours(23, 59, 59, 999);
    return completedDate > dueDate;
  };

  // Helper function to get status label in Indonesian
  const getStatusLabel = (status, job) => {
    // Check for overdue status
    if (isOverdue(job)) {
      return 'Pekerjaan Telat';
    }
    if (wasCompletedLate(job)) {
      return 'Selesai (Terlambat)';
    }
    switch (status) {
      case 'completed': return 'Selesai';
      case 'in_progress': return 'Dalam Proses';
      case 'pending': return 'Pending';
      default: return status;
    }
  };

  // Helper function to get status color
  const getStatusColor = (status, job) => {
    // Check for overdue status
    if (isOverdue(job)) {
      return 'text-red-600 bg-red-100';
    }
    if (wasCompletedLate(job)) {
      return 'text-orange-600 bg-orange-100';
    }
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
        user.role !== 'karyawan' ? userAPI.getList() : Promise.resolve({ users: [] }),
        clientAPI.getAll().catch(() => ({ clients: [] })) // Graceful fallback if clients fail
      ];

      if (user.role !== 'karyawan') {
        promises.push(divisionAPI.getAll());
      }

      const results = await Promise.all(promises);

      setJobdesks(results[0].jobdesks || []);
      setUsers(results[1].users || []);
      setClients(results[2].clients || []);
      if (results[3]) {
        setDivisions(results[3].divisions || []);
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
    let jobdeskData = user.role === 'karyawan'
      ? { ...formData, assignedTo: [user.id] }
      : { ...formData };

    // If creating new client, include the newClient data
    if (clientMode === 'new' && newClientData.name) {
      jobdeskData.newClient = newClientData;
      jobdeskData.clientId = null;
    }

    // Validation for admin/pengurus only
    if ((user.role === 'super_admin' || user.role === 'pengurus') && jobdeskData.assignedTo.length === 0) {
      toast.error('Pilih minimal satu karyawan');
      return;
    }

    try {
      await jobdeskAPI.create(jobdeskData);
      toast.success('Jobdesk berhasil dibuat!');
      setShowCreateModal(false);
      setFormData({
        title: '', description: '', assignedTo: [], dueDate: '', submissionLink: '',
        clientId: '', newClient: null, periodMonth: new Date().getMonth() + 1,
        periodYear: new Date().getFullYear(), taskTypes: DEFAULT_TASK_TYPES
      });
      setClientMode('existing');
      setNewClientData({ name: '', groupName: '', npwp: '', address: '', contactPerson: '', phone: '', email: '', isPkp: false, isUmkm: true });
      loadData();
    } catch (error) {
      console.error('Failed to create jobdesk:', error);
      toast.error(error.message || 'Gagal membuat jobdesk');
    }
  };

  // Load jobdesk detail and submissions
  const loadJobdeskDetail = async (jobdeskId) => {
    try {
      const [detailRes, submissionsRes] = await Promise.all([
        jobdeskAPI.getById(jobdeskId),
        jobdeskAPI.getSubmissions(jobdeskId)
      ]);
      setDetailData(detailRes.jobdesk);
      setSubmissions(submissionsRes.submissions || []);
    } catch (error) {
      console.error('Failed to load detail:', error);
      toast.error('Gagal memuat detail jobdesk');
    }
  };

  // Handle submission creation
  const handleCreateSubmission = async (e) => {
    e.preventDefault();
    if (!selectedJobdesk) return;

    try {
      await jobdeskAPI.createSubmission(selectedJobdesk.id, submissionForm);
      toast.success('Hasil kerja berhasil dikumpulkan!');
      setSubmissionForm({ submissionType: 'link', title: '', content: '', taskType: '', notes: '' });
      loadJobdeskDetail(selectedJobdesk.id);
    } catch (error) {
      console.error('Failed to create submission:', error);
      toast.error(error.message || 'Gagal mengumpulkan hasil kerja');
    }
  };

  // Handle inline submission for specific task type
  const handleInlineSubmission = async (taskTypeId) => {
    if (!selectedJobdesk) return;

    // Validate based on submission type
    if (inlineForm.submissionType === 'file') {
      if (!inlineForm.file) {
        toast.error('Pilih file untuk diupload');
        return;
      }
    } else if (!inlineForm.content.trim()) {
      toast.error('Isi konten tidak boleh kosong');
      return;
    }

    try {
      const taskLabel = TASK_TYPES.find(t => t.id === taskTypeId)?.label || taskTypeId;

      if (inlineForm.submissionType === 'file') {
        // Handle file upload
        setUploadingFile(true);
        const formData = new FormData();
        formData.append('file', inlineForm.file);
        formData.append('taskType', taskTypeId);
        formData.append('notes', inlineForm.notes || '');

        await jobdeskAPI.uploadSubmissionFile(selectedJobdesk.id, formData);
        toast.success(`File untuk ${taskLabel} berhasil diupload!`);
      } else {
        // Handle link or note
        await jobdeskAPI.createSubmission(selectedJobdesk.id, {
          submissionType: inlineForm.submissionType,
          title: taskLabel,
          content: inlineForm.content,
          taskType: taskTypeId,
          notes: inlineForm.notes
        });
        toast.success(`Hasil kerja ${taskLabel} berhasil dikumpulkan!`);
      }

      setInlineForm({ submissionType: 'link', content: '', notes: '', file: null });
      setActiveTaskTypeForm(null);
      loadJobdeskDetail(selectedJobdesk.id);
    } catch (error) {
      console.error('Failed to create inline submission:', error);
      toast.error(error.message || 'Gagal mengumpulkan hasil kerja');
    } finally {
      setUploadingFile(false);
    }
  };

  // Group submissions by task type
  const getSubmissionsByTaskType = () => {
    const grouped = {};
    const taskTypes = detailData?.taskTypes || [];

    // Initialize groups for all task types in the jobdesk
    taskTypes.forEach(t => {
      grouped[t] = [];
    });
    // Add general category for submissions without task type
    grouped['general'] = [];

    // Group submissions
    submissions.forEach(sub => {
      const key = sub.taskType || 'general';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(sub);
    });

    return grouped;
  };

  // Handle submission deletion
  const handleDeleteSubmission = async (submissionId) => {
    try {
      await jobdeskAPI.deleteSubmission(submissionId);
      toast.success('Hasil kerja berhasil dihapus');
      loadJobdeskDetail(selectedJobdesk.id);
    } catch (error) {
      console.error('Failed to delete submission:', error);
      toast.error('Gagal menghapus hasil kerja');
    }
  };

  // Toggle task type selection
  const toggleTaskType = (taskId) => {
    setFormData(prev => ({
      ...prev,
      taskTypes: prev.taskTypes.includes(taskId)
        ? prev.taskTypes.filter(t => t !== taskId)
        : [...prev.taskTypes, taskId]
    }));
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
            setFormData({
              title: '', description: '', assignedTo: [], dueDate: '', submissionLink: '',
              clientId: '', newClient: null, periodMonth: new Date().getMonth() + 1,
              periodYear: new Date().getFullYear(), taskTypes: DEFAULT_TASK_TYPES
            });
            setClientMode('existing');
            setNewClientData({ name: '', groupName: '', npwp: '', address: '', contactPerson: '', phone: '', email: '', isPkp: false, isUmkm: true });
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
                {/* Client Section */}
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <Label className="font-semibold">Data Klien</Label>
                  </div>

                  <Tabs value={clientMode} onValueChange={setClientMode} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-3">
                      <TabsTrigger value="existing">Pilih Klien</TabsTrigger>
                      <TabsTrigger value="new">Klien Baru</TabsTrigger>
                    </TabsList>

                    <TabsContent value="existing" className="space-y-3">
                      <Select value={formData.clientId || 'none'} onValueChange={(val) => setFormData({ ...formData, clientId: val === 'none' ? '' : val })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih klien yang ada..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-- Tanpa Klien --</SelectItem>
                          {clients.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} {c.npwp ? `(${c.npwp})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TabsContent>

                    <TabsContent value="new" className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="clientName">Nama Klien *</Label>
                          <Input
                            id="clientName"
                            value={newClientData.name}
                            onChange={(e) => setNewClientData({ ...newClientData, name: e.target.value })}
                            placeholder="PT. Contoh Perusahaan"
                          />
                        </div>
                        <div>
                          <Label htmlFor="clientGroup">Nama Group</Label>
                          <Input
                            id="clientGroup"
                            value={newClientData.groupName || ''}
                            onChange={(e) => setNewClientData({ ...newClientData, groupName: e.target.value })}
                            placeholder="Nama group (opsional)"
                          />
                        </div>
                        <div>
                          <Label htmlFor="clientNpwp">NPWP</Label>
                          <Input
                            id="clientNpwp"
                            value={newClientData.npwp}
                            onChange={(e) => setNewClientData({ ...newClientData, npwp: e.target.value })}
                            placeholder="00.000.000.0-000.000"
                          />
                        </div>
                        <div>
                          <Label htmlFor="clientPhone">Telepon</Label>
                          <Input
                            id="clientPhone"
                            value={newClientData.phone}
                            onChange={(e) => setNewClientData({ ...newClientData, phone: e.target.value })}
                            placeholder="08xx-xxxx-xxxx"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="clientEmail">Email</Label>
                          <Input
                            id="clientEmail"
                            type="email"
                            value={newClientData.email}
                            onChange={(e) => setNewClientData({ ...newClientData, email: e.target.value })}
                            placeholder="email@perusahaan.com"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-sm font-medium mb-2 block">Kriteria Klien</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                              <Checkbox
                                id="pkp_umum"
                                checked={newClientData.isPkp && !newClientData.isUmkm}
                                onCheckedChange={(checked) => {
                                  if (checked) setNewClientData({ ...newClientData, isPkp: true, isUmkm: false });
                                }}
                              />
                              <Label htmlFor="pkp_umum" className="text-sm cursor-pointer">
                                <div className="font-medium">PKP</div>
                                <div className="text-xs text-gray-500">Tarif Umum</div>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                              <Checkbox
                                id="pkp_umkm"
                                checked={newClientData.isPkp && newClientData.isUmkm}
                                onCheckedChange={(checked) => {
                                  if (checked) setNewClientData({ ...newClientData, isPkp: true, isUmkm: true });
                                }}
                              />
                              <Label htmlFor="pkp_umkm" className="text-sm cursor-pointer">
                                <div className="font-medium">PKP & UMKM</div>
                                <div className="text-xs text-gray-500">PKP Tarif 0,5%</div>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                              <Checkbox
                                id="umkm_nonpkp"
                                checked={!newClientData.isPkp && newClientData.isUmkm}
                                onCheckedChange={(checked) => {
                                  if (checked) setNewClientData({ ...newClientData, isPkp: false, isUmkm: true });
                                }}
                              />
                              <Label htmlFor="umkm_nonpkp" className="text-sm cursor-pointer">
                                <div className="font-medium">UMKM Non PKP</div>
                                <div className="text-xs text-gray-500">Tarif 0,5%</div>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                              <Checkbox
                                id="nonpkp_umum"
                                checked={!newClientData.isPkp && !newClientData.isUmkm}
                                onCheckedChange={(checked) => {
                                  if (checked) setNewClientData({ ...newClientData, isPkp: false, isUmkm: false });
                                }}
                              />
                              <Label htmlFor="nonpkp_umum" className="text-sm cursor-pointer">
                                <div className="font-medium">Non PKP</div>
                                <div className="text-xs text-gray-500">Tarif Umum</div>
                              </Label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Period Section */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="periodMonth">Periode Bulan</Label>
                    <Select value={String(formData.periodMonth)} onValueChange={(val) => setFormData({ ...formData, periodMonth: parseInt(val) })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                          <SelectItem key={m} value={String(m)}>
                            {new Date(2000, m-1).toLocaleString('id-ID', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="periodYear">Tahun</Label>
                    <Select value={String(formData.periodYear)} onValueChange={(val) => setFormData({ ...formData, periodYear: parseInt(val) })}>
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

                {/* Task Types */}
                <div>
                  <Label className="mb-2 block">Jenis Tugas Pajak</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {TASK_TYPES.map(task => (
                      <div key={task.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-gray-50">
                        <Checkbox
                          id={`task-${task.id}`}
                          checked={formData.taskTypes.includes(task.id)}
                          onCheckedChange={() => toggleTaskType(task.id)}
                        />
                        <Label htmlFor={`task-${task.id}`} className="text-sm cursor-pointer flex-1">
                          {task.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

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
                    <Label htmlFor="submissionLink">Link Pengumpulan Eksternal (Opsional)</Label>
                    <Input
                      id="submissionLink"
                      type="url"
                      placeholder="https://drive.google.com/... atau https://forms.gle/..."
                      value={formData.submissionLink}
                      onChange={(e) => setFormData({ ...formData, submissionLink: e.target.value })}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Link eksternal untuk pengumpulan (opsional, hasil juga bisa dikumpulkan di sistem)
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
            // Get user's personal status from progress array
            const userProgress = job.progress?.find(p => p.userId === user.id);
            const userStatus = userProgress?.status || job.status; // Fallback to global status for old data
            
            return (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-xl">{job.title}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{job.description}</p>
                    {/* Client & Period Info */}
                    {(job.clientName || job.periodMonth) && (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {job.clientName && (
                          <Badge variant="outline" className="text-xs">
                            <Building2 className="w-3 h-3 mr-1" />
                            {job.clientName}
                            {job.isPkp && <span className="ml-1 text-blue-600">(PKP)</span>}
                          </Badge>
                        )}
                        {job.periodMonth && job.periodYear && (
                          <Badge variant="secondary" className="text-xs">
                            {new Date(job.periodYear, job.periodMonth - 1).toLocaleString('id-ID', { month: 'short', year: 'numeric' })}
                          </Badge>
                        )}
                        {job.taskTypes?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {job.taskTypes.slice(0, 3).map(t => (
                              <Badge key={t} variant="outline" className="text-xs bg-blue-50">
                                {TASK_TYPES.find(tt => tt.id === t)?.label || t}
                              </Badge>
                            ))}
                            {job.taskTypes.length > 3 && (
                              <Badge variant="outline" className="text-xs">+{job.taskTypes.length - 3}</Badge>
                            )}
                          </div>
                        )}
                        {job.submissionCount > 0 && (
                          <Badge variant="outline" className="text-xs text-green-600 bg-green-50">
                            <FileText className="w-3 h-3 mr-1" />
                            {job.submissionCount} hasil
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="ml-4 flex flex-col gap-2">
                    {/* Show user's personal status for karyawan */}
                    {user.role === 'karyawan' && job.assignedTo?.includes(user.id) ? (
                      <>
                        {isOverdue(job) && userStatus !== 'completed' && (
                          <span className="px-3 py-1 bg-red-200 text-red-700 text-sm rounded-full font-medium animate-pulse">
                            Pekerjaan Telat
                          </span>
                        )}
                        {!isOverdue(job) && userStatus === 'pending' && (
                          <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full">
                            Belum Mulai
                          </span>
                        )}
                        {!isOverdue(job) && userStatus === 'in_progress' && (
                          <span className="px-3 py-1 bg-yellow-200 text-yellow-700 text-sm rounded-full">
                            Sedang Dikerjakan
                          </span>
                        )}
                        {userStatus === 'completed' && wasCompletedLate(job) && (
                          <span className="px-3 py-1 bg-orange-200 text-orange-700 text-sm rounded-full">
                            ✓ Selesai (Terlambat)
                          </span>
                        )}
                        {userStatus === 'completed' && !wasCompletedLate(job) && (
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
                          const overdue = isOverdue(job);
                          const completedLate = wasCompletedLate(job);
                          return (
                            <>
                              {overdue && (
                                <span className="px-3 py-1 bg-red-200 text-red-700 text-sm rounded-full font-medium animate-pulse">
                                  Pekerjaan Telat
                                </span>
                              )}
                              {!overdue && effectiveStatus === 'pending' && (
                                <span className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full">
                                  Pending
                                </span>
                              )}
                              {!overdue && effectiveStatus === 'in_progress' && (
                                <span className="px-3 py-1 bg-yellow-200 text-yellow-700 text-sm rounded-full">
                                  Dalam Proses
                                </span>
                              )}
                              {effectiveStatus === 'completed' && completedLate && (
                                <span className="px-3 py-1 bg-orange-200 text-orange-700 text-sm rounded-full">
                                  Selesai (Terlambat)
                                </span>
                              )}
                              {effectiveStatus === 'completed' && !completedLate && (
                                <span className="px-3 py-1 bg-green-200 text-green-700 text-sm rounded-full">
                                  Selesai
                                </span>
                              )}
                            </>
                          );
                        })()}
                        {/* Show progress count with HoverCard tooltip for admin/pengurus */}
                        {job.progress && job.assignedTo?.length > 0 && (
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <span className="text-xs text-blue-600 hover:text-blue-700 cursor-pointer bg-blue-50 px-2 py-1 rounded-full text-center font-medium">
                                <Users className="w-3 h-3 inline mr-1" />
                                {job.progress.filter(p => p.status === 'completed').length}/{job.assignedTo.length} selesai
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-72" align="end">
                              <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-gray-500" />
                                  <h4 className="text-sm font-semibold">Status Progress Karyawan</h4>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {getUserProgressDetails(job).map((detail, idx) => (
                                    <div key={idx} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-50">
                                      <span className="text-sm text-gray-700 truncate max-w-[140px]" title={detail.name}>
                                        {detail.name}
                                      </span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(detail.status)}`}>
                                        {detail.status === 'completed' && '✓ '}
                                        {getStatusLabel(detail.status)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                <div className="pt-2 border-t text-xs text-gray-500">
                                  {job.progress.filter(p => p.status === 'completed').length} dari {job.assignedTo.length} karyawan selesai
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
                      <div className={`flex items-center space-x-1 ${isOverdue(job) ? 'text-red-600 font-medium' : ''}`}>
                        <Calendar className={`w-4 h-4 ${isOverdue(job) ? 'text-red-600' : ''}`} />
                        <span>
                          {new Date(job.dueDate).toLocaleDateString('id-ID')}
                          {isOverdue(job) && ' (Lewat Tenggat)'}
                        </span>
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
                    {/* Detail & Submissions Button */}
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        setSelectedJobdesk(job);
                        loadJobdeskDetail(job.id);
                        setShowDetailModal(true);
                      }}
                      className="flex-1 sm:flex-none"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Lihat Detail</span>
                      <span className="sm:hidden">Detail</span>
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

      {/* Detail & Submissions Modal */}
      <Dialog open={showDetailModal} onOpenChange={(open) => {
        setShowDetailModal(open);
        if (!open) {
          setActiveTaskTypeForm(null);
          setInlineForm({ submissionType: 'link', content: '', notes: '', file: null });
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {selectedJobdesk?.title}
            </DialogTitle>
            <DialogDescription>
              Detail jobdesk dan pengumpulan hasil kerja
            </DialogDescription>
          </DialogHeader>

          {detailData ? (
            <Tabs defaultValue="detail" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="detail">Detail</TabsTrigger>
                <TabsTrigger value="submissions">
                  Hasil Kerja ({submissions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="detail" className="space-y-4 mt-4">
                {/* Client Info */}
                {detailData.client && (
                  <div className="p-4 border rounded-lg bg-blue-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold">Klien</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-600">Nama:</span> {detailData.client.name}</div>
                      <div><span className="text-gray-600">NPWP:</span> {detailData.client.npwp || '-'}</div>
                      <div><span className="text-gray-600">Status:</span> {detailData.client.isPkp ? 'PKP' : 'Non-PKP'} / {detailData.client.isUmkm ? 'UMKM' : 'Non-UMKM'}</div>
                      <div><span className="text-gray-600">Telepon:</span> {detailData.client.phone || '-'}</div>
                    </div>
                  </div>
                )}

                {/* Period & Task Types */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg">
                    <span className="text-sm text-gray-600">Periode</span>
                    <p className="font-medium">
                      {detailData.periodMonth && detailData.periodYear
                        ? new Date(detailData.periodYear, detailData.periodMonth - 1).toLocaleString('id-ID', { month: 'long', year: 'numeric' })
                        : '-'}
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg">
                    <span className="text-sm text-gray-600">Tenggat</span>
                    <p className="font-medium">
                      {detailData.dueDate ? new Date(detailData.dueDate).toLocaleDateString('id-ID') : '-'}
                    </p>
                  </div>
                </div>

                {/* Task Types */}
                {detailData.taskTypes?.length > 0 && (
                  <div className="p-3 border rounded-lg">
                    <span className="text-sm text-gray-600 block mb-2">Jenis Tugas</span>
                    <div className="flex flex-wrap gap-2">
                      {detailData.taskTypes.map(t => (
                        <Badge key={t} variant="secondary">
                          {TASK_TYPES.find(tt => tt.id === t)?.label || t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assigned Users */}
                <div className="p-3 border rounded-lg">
                  <span className="text-sm text-gray-600 block mb-2">Karyawan Ditugaskan</span>
                  <div className="flex flex-wrap gap-2">
                    {detailData.assignedUsers?.map(u => (
                      <Badge key={u.id} variant="outline">
                        <User className="w-3 h-3 mr-1" />
                        {u.name}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Description */}
                {detailData.description && (
                  <div className="p-3 border rounded-lg">
                    <span className="text-sm text-gray-600 block mb-2">Deskripsi</span>
                    <p className="text-sm whitespace-pre-wrap">{detailData.description}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="submissions" className="space-y-4 mt-4">
                {/* Grouped Submissions by Task Type */}
                {(user.role !== 'karyawan' || selectedJobdesk?.assignedTo?.includes(user.id)) && (
                  <>
                    {/* Task Type Cards with Inline Forms */}
                    <div className="space-y-3">
                      {(detailData?.taskTypes || []).map(taskTypeId => {
                        const taskType = TASK_TYPES.find(t => t.id === taskTypeId);
                        const taskSubmissions = getSubmissionsByTaskType()[taskTypeId] || [];
                        const hasSubmissions = taskSubmissions.length > 0;
                        const isActive = activeTaskTypeForm === taskTypeId;

                        // Calculate deadline for this task type
                        const deadline = calculateTaskDeadline(taskTypeId, detailData?.periodMonth, detailData?.periodYear);
                        const deadlinePassed = isDeadlinePassed(deadline);

                        // Check if any submission for this task type is late
                        const hasLateSubmission = taskSubmissions.some(sub => sub.isLate);

                        return (
                          <div key={taskTypeId} className="border rounded-lg overflow-hidden">
                            {/* Task Type Header */}
                            <div
                              className={`p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 ${hasSubmissions ? 'bg-green-50 border-l-4 border-l-green-500' : deadlinePassed ? 'bg-red-50 border-l-4 border-l-red-500' : 'bg-yellow-50 border-l-4 border-l-yellow-500'}`}
                              onClick={() => setActiveTaskTypeForm(isActive ? null : taskTypeId)}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant={hasSubmissions ? 'default' : 'secondary'} className={hasSubmissions ? 'bg-green-600' : deadlinePassed ? 'bg-red-600' : 'bg-yellow-600'}>
                                  {taskType?.label || taskTypeId}
                                </Badge>
                                {deadline && (
                                  <span className={`text-xs ${deadlinePassed ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                                    Deadline: {formatDeadlineDate(deadline)}
                                  </span>
                                )}
                                {hasSubmissions ? (
                                  <span className="text-xs text-green-700">✓ {taskSubmissions.length} lampiran</span>
                                ) : deadlinePassed ? (
                                  <Badge className="bg-red-100 text-red-800 text-xs">Terlambat</Badge>
                                ) : (
                                  <span className="text-xs text-yellow-700">Belum ada lampiran</span>
                                )}
                                {hasLateSubmission && (
                                  <Badge className="bg-orange-100 text-orange-800 text-xs">Dikumpulkan Terlambat (-5 poin)</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTaskTypeForm(isActive ? null : taskTypeId);
                                    setInlineForm({ submissionType: 'link', content: '', notes: '', file: null });
                                  }}
                                >
                                  <Plus className="w-4 h-4 mr-1" />
                                  Tambah
                                </Button>
                              </div>
                            </div>

                            {/* Inline Form */}
                            {isActive && (
                              <div className="p-3 bg-gray-50 border-t">
                                <div className="space-y-3">
                                  <div className="flex gap-2">
                                    <Select value={inlineForm.submissionType} onValueChange={(val) => setInlineForm({ ...inlineForm, submissionType: val, content: '', file: null })}>
                                      <SelectTrigger className="w-32">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="link">Link</SelectItem>
                                        <SelectItem value="file">Upload File</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex-1">
                                      {inlineForm.submissionType === 'link' ? (
                                        <Input
                                          type="url"
                                          value={inlineForm.content}
                                          onChange={(e) => setInlineForm({ ...inlineForm, content: e.target.value })}
                                          placeholder="https://drive.google.com/..."
                                        />
                                      ) : (
                                        <div className="space-y-2">
                                          <Input
                                            type="file"
                                            onChange={(e) => setInlineForm({ ...inlineForm, file: e.target.files[0] })}
                                            className="cursor-pointer"
                                          />
                                          {inlineForm.file && (
                                            <p className="text-xs text-gray-500">
                                              📎 {inlineForm.file.name} ({(inlineForm.file.size / 1024).toFixed(1)} KB)
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <Input
                                      value={inlineForm.notes}
                                      onChange={(e) => setInlineForm({ ...inlineForm, notes: e.target.value })}
                                      placeholder="Catatan tambahan (opsional)..."
                                      className="text-sm"
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setActiveTaskTypeForm(null);
                                        setInlineForm({ submissionType: 'link', content: '', notes: '', file: null });
                                      }}
                                    >
                                      Batal
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleInlineSubmission(taskTypeId)}
                                      disabled={uploadingFile || (inlineForm.submissionType === 'link' ? !inlineForm.content.trim() : !inlineForm.file)}
                                    >
                                      {uploadingFile ? (
                                        <>
                                          <span className="animate-spin mr-1">⏳</span>
                                          Uploading...
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="w-4 h-4 mr-1" />
                                          Simpan
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Submissions List for this Task Type */}
                            {taskSubmissions.length > 0 && (
                              <div className="border-t divide-y">
                                {taskSubmissions.map(sub => (
                                  <div key={sub.id} className={`p-3 flex items-start justify-between hover:bg-gray-50 ${sub.isLate ? 'bg-orange-50' : ''}`}>
                                    <div className="flex-1">
                                      {sub.submissionType === 'link' ? (
                                        <a href={sub.content} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                                          {sub.content}
                                        </a>
                                      ) : sub.submissionType === 'file' ? (
                                        <a href={sub.content} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                          <Paperclip className="w-3 h-3" />
                                          {sub.fileName || 'Download File'}
                                          {sub.fileSize && <span className="text-gray-400 text-xs">({(sub.fileSize / 1024).toFixed(1)} KB)</span>}
                                        </a>
                                      ) : (
                                        <p className="text-sm text-gray-700">{sub.content}</p>
                                      )}
                                      {sub.notes && (
                                        <p className="text-xs text-gray-500 mt-1 italic">📝 {sub.notes}</p>
                                      )}
                                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                                        <p className="text-xs text-gray-400">
                                          <User className="w-3 h-3 inline mr-1" />
                                          {sub.submittedByName} • {new Date(sub.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        {sub.isLate && (
                                          <Badge className="bg-orange-100 text-orange-800 text-xs">
                                            Terlambat {sub.lateDays} hari (-5 poin)
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                    {(user.role === 'super_admin' || user.role === 'owner' || sub.submittedBy === user.id) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteSubmission(sub.id)}
                                        className="text-red-600 hover:text-red-700"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* General Submissions (without task type) */}
                      {(() => {
                        const generalSubmissions = getSubmissionsByTaskType()['general'] || [];
                        if (generalSubmissions.length === 0 && (detailData?.taskTypes || []).length > 0) return null;

                        return (
                          <div className="border rounded-lg overflow-hidden">
                            <div className="p-3 bg-gray-100 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">Umum</Badge>
                                <span className="text-xs text-gray-600">{generalSubmissions.length} lampiran</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setActiveTaskTypeForm(activeTaskTypeForm === 'general' ? null : 'general');
                                  setInlineForm({ submissionType: 'link', content: '', notes: '', file: null });
                                }}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Tambah
                              </Button>
                            </div>

                            {/* Inline Form for General */}
                            {activeTaskTypeForm === 'general' && (
                              <div className="p-3 bg-gray-50 border-t">
                                <div className="space-y-3">
                                  <div className="flex gap-2">
                                    <Select value={inlineForm.submissionType} onValueChange={(val) => setInlineForm({ ...inlineForm, submissionType: val, content: '', file: null })}>
                                      <SelectTrigger className="w-32">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="link">Link</SelectItem>
                                        <SelectItem value="file">Upload File</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex-1">
                                      {inlineForm.submissionType === 'link' ? (
                                        <Input
                                          type="url"
                                          value={inlineForm.content}
                                          onChange={(e) => setInlineForm({ ...inlineForm, content: e.target.value })}
                                          placeholder="https://..."
                                        />
                                      ) : (
                                        <div className="space-y-2">
                                          <Input
                                            type="file"
                                            onChange={(e) => setInlineForm({ ...inlineForm, file: e.target.files[0] })}
                                            className="cursor-pointer"
                                          />
                                          {inlineForm.file && (
                                            <p className="text-xs text-gray-500">
                                              📎 {inlineForm.file.name} ({(inlineForm.file.size / 1024).toFixed(1)} KB)
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <Input
                                    value={inlineForm.notes}
                                    onChange={(e) => setInlineForm({ ...inlineForm, notes: e.target.value })}
                                    placeholder="Catatan tambahan (opsional)..."
                                    className="text-sm"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setActiveTaskTypeForm(null);
                                        setInlineForm({ submissionType: 'link', content: '', notes: '', file: null });
                                      }}
                                    >
                                      Batal
                                    </Button>
                                    <Button
                                      size="sm"
                                      onClick={() => handleInlineSubmission('')}
                                      disabled={uploadingFile || (inlineForm.submissionType === 'link' ? !inlineForm.content.trim() : !inlineForm.file)}
                                    >
                                      {uploadingFile ? (
                                        <>
                                          <span className="animate-spin mr-1">⏳</span>
                                          Uploading...
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="w-4 h-4 mr-1" />
                                          Simpan
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {generalSubmissions.length > 0 && (
                              <div className="border-t divide-y">
                                {generalSubmissions.map(sub => (
                                  <div key={sub.id} className="p-3 flex items-start justify-between hover:bg-gray-50">
                                    <div className="flex-1">
                                      {sub.submissionType === 'link' ? (
                                        <a href={sub.content} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                                          {sub.content}
                                        </a>
                                      ) : sub.submissionType === 'file' ? (
                                        <a href={sub.content} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                          <Paperclip className="w-3 h-3" />
                                          {sub.fileName || 'Download File'}
                                          {sub.fileSize && <span className="text-gray-400 text-xs">({(sub.fileSize / 1024).toFixed(1)} KB)</span>}
                                        </a>
                                      ) : (
                                        <p className="text-sm text-gray-700">{sub.content}</p>
                                      )}
                                      {sub.notes && (
                                        <p className="text-xs text-gray-500 mt-1 italic">📝 {sub.notes}</p>
                                      )}
                                      <p className="text-xs text-gray-400 mt-1">
                                        <User className="w-3 h-3 inline mr-1" />
                                        {sub.submittedByName} • {new Date(sub.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                    {(user.role === 'super_admin' || user.role === 'owner' || sub.submittedBy === user.id) && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteSubmission(sub.id)}
                                        className="text-red-600 hover:text-red-700"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Empty State */}
                    {(detailData?.taskTypes || []).length === 0 && submissions.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p>Tidak ada jenis tugas pajak yang dipilih untuk jobdesk ini.</p>
                        <p className="text-sm mt-1">Tambahkan jenis tugas pajak saat membuat jobdesk untuk mengaktifkan fitur lampiran per tugas.</p>
                      </div>
                    )}
                  </>
                )}

                {/* Read-only view for non-assigned users */}
                {user.role === 'karyawan' && !selectedJobdesk?.assignedTo?.includes(user.id) && (
                  <div className="text-center py-8 text-gray-500">
                    <p>Anda tidak memiliki akses untuk menambahkan hasil kerja pada jobdesk ini.</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="text-center py-8">Memuat data...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}