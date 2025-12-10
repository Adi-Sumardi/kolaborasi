'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { todoAPI } from '@/lib/api';
import { Plus, Trash2, Check, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';

export default function TodoPage({ user }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    priority: 'medium',
    dueDate: ''
  });

  useEffect(() => {
    loadTodos();
  }, []);

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

  const handleCreateTodo = async (e) => {
    e.preventDefault();

    try {
      await todoAPI.create(formData);
      toast.success('To-do berhasil ditambahkan!');
      setShowCreateModal(false);
      setFormData({ title: '', priority: 'medium', dueDate: '' });
      loadTodos();
    } catch (error) {
      console.error('Failed to create todo:', error);
      toast.error('Gagal menambahkan to-do');
    }
  };

  const handleToggleTodo = async (todoId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

    try {
      await todoAPI.update(todoId, { status: newStatus });
      loadTodos();
    } catch (error) {
      console.error('Failed to toggle todo:', error);
      toast.error('Gagal mengubah status');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityLabel = (priority) => {
    switch (priority) {
      case 'high': return 'Tinggi';
      case 'medium': return 'Sedang';
      case 'low': return 'Rendah';
      default: return priority;
    }
  };

  const pendingTodos = todos.filter(t => t.status === 'pending');
  const completedTodos = todos.filter(t => t.status === 'completed');

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">To-Do List</h1>
          <p className="text-gray-600 mt-1">Kelola tugas pribadi Anda</p>
        </div>
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Tambah To-Do
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tambah To-Do Baru</DialogTitle>
              <DialogDescription>
                Buat item to-do list baru
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateTodo} className="space-y-4">
              <div>
                <Label htmlFor="title">Judul *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Apa yang perlu dilakukan?"
                  required
                />
              </div>
              <div>
                <Label htmlFor="priority">Prioritas</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Rendah</SelectItem>
                    <SelectItem value="medium">Sedang</SelectItem>
                    <SelectItem value="high">Tinggi</SelectItem>
                  </SelectContent>
                </Select>
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
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Batal
                </Button>
                <Button type="submit">Tambah</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{todos.length}</div>
            <p className="text-sm text-gray-600">Total To-Do</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{pendingTodos.length}</div>
            <p className="text-sm text-gray-600">Belum Selesai</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{completedTodos.length}</div>
            <p className="text-sm text-gray-600">Selesai</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Todos */}
      <Card>
        <CardHeader>
          <CardTitle>Belum Selesai</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingTodos.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Tidak ada tugas pending</p>
          ) : (
            <div className="space-y-2">
              {pendingTodos.map(todo => (
                <div key={todo.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                  <div className="flex items-center space-x-3 flex-1">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => handleToggleTodo(todo.id, todo.status)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{todo.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getPriorityColor(todo.priority)}`}>
                          {getPriorityLabel(todo.priority)}
                        </span>
                        {todo.dueDate && (
                          <div className="flex items-center space-x-1 text-xs text-gray-600">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(todo.dueDate).toLocaleDateString('id-ID')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completed Todos */}
      <Card>
        <CardHeader>
          <CardTitle>Selesai</CardTitle>
        </CardHeader>
        <CardContent>
          {completedTodos.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Belum ada tugas selesai</p>
          ) : (
            <div className="space-y-2">
              {completedTodos.map(todo => (
                <div key={todo.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center space-x-3 flex-1">
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => handleToggleTodo(todo.id, todo.status)}
                    />
                    <div className="flex-1">
                      <p className="font-medium line-through text-gray-600">{todo.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${getPriorityColor(todo.priority)}`}>
                          {getPriorityLabel(todo.priority)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Check className="w-5 h-5 text-green-600" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}