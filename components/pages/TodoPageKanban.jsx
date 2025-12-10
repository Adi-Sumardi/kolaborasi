'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { todoAPI } from '@/lib/api';
import { Plus, Trash2, Edit2, GripVertical, CheckCircle, Briefcase } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  TouchSensor,
  useDroppable
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Task Card Component
function TaskCard({ task, onDelete, onEdit }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'border-l-4 border-l-red-500';
      case 'medium': return 'border-l-4 border-l-yellow-500';
      case 'low': return 'border-l-4 border-l-green-500';
      default: return 'border-l-4 border-l-gray-400';
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg shadow-sm p-3 mb-2 cursor-move hover:shadow-md transition-shadow ${getPriorityColor(task.priority)}`}
    >
      <div className="flex items-start gap-2">
        <div {...attributes} {...listeners} className="mt-1 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900 break-words">{task.task || task.title}</p>
          {task.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
          )}
          {task.dueDate && (
            <p className="text-xs text-gray-400 mt-1">
              📅 {new Date(task.dueDate).toLocaleDateString('id-ID')}
            </p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(task)}
          >
            <Edit2 className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => onDelete(task)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Kanban Column Component
function KanbanColumn({ title, status, tasks, color, onAddTask, onDelete, onEdit }) {
  const taskIds = tasks.map(t => t.id);
  const { setNodeRef } = useDroppable({
    id: status,
  });

  return (
    <div className="flex-1 min-w-[280px] sm:min-w-0">
      <Card className="h-full">
        <CardHeader className={`${color} pb-3`}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg font-semibold text-white">
                {title}
              </CardTitle>
              <p className="text-xs text-white/80 mt-1">{tasks.length} tugas</p>
            </div>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full"
              onClick={onAddTask}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent ref={setNodeRef} className="p-3 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto">
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                Tidak ada tugas
              </div>
            ) : (
              tasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onDelete={onDelete}
                  onEdit={onEdit}
                />
              ))
            )}
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TodoPageKanban({ user }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('draft');
  const [editingTask, setEditingTask] = useState(null);
  const [deletingTask, setDeletingTask] = useState(null);
  const [formData, setFormData] = useState({
    task: '',
    description: '',
    priority: 'medium',
    dueDate: '',
    jobdeskId: ''
  });
  const [jobdesks, setJobdesks] = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    loadTodos();
    loadJobdesks();
  }, []);

  const loadJobdesks = async () => {
    try {
      const res = await fetch('/api/jobdesks');
      const data = await res.json();
      // Filter only assigned jobdesks for current user
      const myJobdesks = data.jobdesks?.filter(j => 
        j.assignedTo?.includes(user.id) || 
        user.role === 'super_admin' || 
        user.role === 'pengurus'
      ) || [];
      setJobdesks(myJobdesks);
    } catch (error) {
      console.error('Failed to load jobdesks:', error);
    }
  };

  const loadTodos = async () => {
    try {
      const res = await todoAPI.getAll();
      setTodos(res.todos || []);
    } catch (error) {
      console.error('Failed to load todos:', error);
      toast.error('Gagal memuat to-do list');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (!over) {
      return;
    }

    const activeTask = todos.find(t => t.id === active.id);
    if (!activeTask) {
      return;
    }

    // Determine new status
    let newStatus = activeTask.status;
    
    // Check if dropped directly on a column (droppable area)
    if (over.id === 'draft' || over.id === 'pending') {
      newStatus = 'draft';
    } else if (over.id === 'in_progress') {
      newStatus = 'in_progress';
    } else if (over.id === 'done' || over.id === 'completed') {
      newStatus = 'done';
    } else {
      // Dropped on a task, get that task's status
      const overTask = todos.find(t => t.id === over.id);
      if (overTask) {
        newStatus = overTask.status;
      }
    }

    // Update status if changed
    if (newStatus !== activeTask.status) {
      // Optimistically update UI
      setTodos(todos.map(t => 
        t.id === activeTask.id ? { ...t, status: newStatus } : t
      ));

      try {
        await todoAPI.update(activeTask.id, { status: newStatus });
        toast.success(`Status diubah ke ${getStatusLabel(newStatus)}!`);
      } catch (error) {
        console.error('Failed to update status:', error);
        toast.error('Gagal mengubah status');
        // Revert on error
        loadTodos();
      }
    }
  };

  const handleDragOver = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeTask = todos.find(t => t.id === active.id);
    const overTask = todos.find(t => t.id === over.id);

    if (!activeTask || !overTask) return;

    // Only update if moving to different column
    if (activeTask.status !== overTask.status) {
      setTodos(todos => {
        return todos.map(t => 
          t.id === active.id ? { ...t, status: overTask.status } : t
        );
      });
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'draft':
      case 'pending':
        return 'Draft';
      case 'in_progress':
        return 'On Progress';
      case 'done':
      case 'completed':
        return 'Done';
      default:
        return status;
    }
  };

  const handleCreateTodo = async (e) => {
    e.preventDefault();

    try {
      await todoAPI.create({
        title: formData.task,
        description: formData.description,
        priority: formData.priority,
        dueDate: formData.dueDate,
        jobdeskId: formData.jobdeskId || null,
        status: selectedStatus
      });
      toast.success('Tugas berhasil ditambahkan!');
      setShowCreateModal(false);
      setFormData({ task: '', description: '', priority: 'medium', dueDate: '', jobdeskId: '' });
      loadTodos();
    } catch (error) {
      console.error('Failed to create todo:', error);
      toast.error(error.message || 'Gagal menambahkan tugas');
    }
  };

  const handleUpdateTodo = async (e) => {
    e.preventDefault();

    try {
      await todoAPI.update(editingTask.id, {
        title: formData.task, // API expects "title" not "task"
        description: formData.description,
        priority: formData.priority,
        dueDate: formData.dueDate
      });
      toast.success('Tugas berhasil diupdate!');
      setShowEditModal(false);
      setEditingTask(null);
      setFormData({ task: '', description: '', priority: 'medium', dueDate: '' });
      loadTodos();
    } catch (error) {
      console.error('Failed to update todo:', error);
      toast.error(error.message || 'Gagal mengupdate tugas');
    }
  };

  const openDeleteDialog = (task) => {
    setDeletingTask(task);
    setShowDeleteDialog(true);
  };

  const handleDeleteTodo = async () => {
    if (!deletingTask) return;

    try {
      await todoAPI.delete(deletingTask.id);
      toast.success('Tugas berhasil dihapus!');
      setShowDeleteDialog(false);
      setDeletingTask(null);
      loadTodos();
    } catch (error) {
      console.error('Failed to delete todo:', error);
      toast.error('Gagal menghapus tugas');
    }
  };

  const openAddModal = (status) => {
    setSelectedStatus(status);
    setShowCreateModal(true);
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    
    let formattedDate = '';
    if (task.dueDate) {
      const date = new Date(task.dueDate);
      formattedDate = date.toISOString().split('T')[0];
    }
    
    setFormData({
      task: task.task || task.title || '',
      description: task.description || '',
      priority: task.priority || 'medium',
      dueDate: formattedDate,
      jobdeskId: task.jobdeskId || ''
    });
    setShowEditModal(true);
  };

  const draftTodos = todos.filter(t => t.status === 'draft' || t.status === 'pending');
  const inProgressTodos = todos.filter(t => t.status === 'in_progress');
  const doneTodos = todos.filter(t => t.status === 'done' || t.status === 'completed');

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">To-Do Kanban Board</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
            Geser kartu untuk mengubah status tugas
          </p>
        </div>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          <KanbanColumn
            title="📝 Draft"
            status="draft"
            tasks={draftTodos}
            color="bg-gradient-to-r from-gray-500 to-gray-600"
            onAddTask={() => openAddModal('draft')}
            onDelete={openDeleteDialog}
            onEdit={openEditModal}
          />
          <KanbanColumn
            title="⚡ On Progress"
            status="in_progress"
            tasks={inProgressTodos}
            color="bg-gradient-to-r from-blue-500 to-blue-600"
            onAddTask={() => openAddModal('in_progress')}
            onDelete={openDeleteDialog}
            onEdit={openEditModal}
          />
          <KanbanColumn
            title="✅ Done"
            status="done"
            tasks={doneTodos}
            color="bg-gradient-to-r from-green-500 to-green-600"
            onAddTask={() => openAddModal('done')}
            onDelete={openDeleteDialog}
            onEdit={openEditModal}
          />
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="bg-white rounded-lg shadow-lg p-3 rotate-3">
              <p className="font-medium text-sm">Dragging...</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Tugas Baru</DialogTitle>
            <DialogDescription>
              Buat tugas baru untuk dikelola
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTodo} className="space-y-4">
            <div>
              <Label htmlFor="task">Judul Tugas *</Label>
              <Input
                id="task"
                value={formData.task}
                onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                placeholder="Nama tugas"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detail tugas (opsional)"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Prioritas</Label>
                <select
                  id="priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-gray-300 text-sm"
                >
                  <option value="low">Rendah</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi</option>
                </select>
              </div>
              <div>
                <Label htmlFor="dueDate">Deadline</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Batal
              </Button>
              <Button type="submit">Tambah</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Tugas</DialogTitle>
            <DialogDescription>
              Update detail tugas Anda
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateTodo} className="space-y-4">
            <div>
              <Label htmlFor="edit-task">Judul Tugas *</Label>
              <Input
                id="edit-task"
                value={formData.task}
                onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                placeholder="Nama tugas"
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Deskripsi</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detail tugas (opsional)"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-priority">Prioritas</Label>
                <select
                  id="edit-priority"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full h-10 px-3 rounded-md border border-gray-300 text-sm"
                >
                  <option value="low">Rendah</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi</option>
                </select>
              </div>
              <div>
                <Label htmlFor="edit-dueDate">Deadline</Label>
                <Input
                  id="edit-dueDate"
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Batal
              </Button>
              <Button type="submit">Update</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="w-[95vw] sm:w-full max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Tugas?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus tugas <strong>{deletingTask?.task || deletingTask?.title}</strong>? 
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteTodo} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
