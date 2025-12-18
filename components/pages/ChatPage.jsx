'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { chatAPI, userAPI } from '@/lib/api';
import { Plus, Send, Users, MessageCircle, Clock, Settings, UserPlus, UserMinus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function ChatPage({ user, socket }) {
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState({ name: '', members: [] });
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadRooms();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await userAPI.getAll();
      setUsers(res.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  useEffect(() => {
    if (socket && selectedRoom) {
      // Join room
      socket.emit('join_room', selectedRoom.id);

      // Listen for new messages with deduplication
      const handleNewMessage = (message) => {
        if (message.roomId === selectedRoom.id) {
          setMessages(prev => {
            // Prevent duplicate messages by checking if message already exists
            // Check by id if available, otherwise by content+userId+timestamp
            const isDuplicate = prev.some(m =>
              (message.id && m.id === message.id) ||
              (m.content === message.content &&
               m.userId === message.userId &&
               Math.abs(new Date(m.createdAt) - new Date(message.createdAt)) < 2000)
            );

            if (isDuplicate) {
              return prev;
            }
            return [...prev, message];
          });
        }
      };

      socket.on('new_message', handleNewMessage);

      // Load existing messages
      loadMessages(selectedRoom.id);

      return () => {
        socket.emit('leave_room', selectedRoom.id);
        socket.off('new_message', handleNewMessage);
      };
    }
  }, [socket, selectedRoom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadRooms = async () => {
    try {
      const res = await chatAPI.getRooms();
      setRooms(res.rooms || []);
    } catch (error) {
      console.error('Failed to load rooms:', error);
      toast.error('Gagal memuat ruang chat');
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (roomId) => {
    try {
      const res = await chatAPI.getMessages(roomId);
      setMessages(res.messages || []);
    } catch (error) {
      console.error('Failed to load messages:', error);
      toast.error('Gagal memuat pesan');
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();

    if (formData.members.length === 0) {
      toast.error('Pilih minimal 1 anggota');
      return;
    }

    try {
      await chatAPI.createRoom({
        name: formData.name,
        members: formData.members,
        type: 'group'
      });
      toast.success('Ruang chat berhasil dibuat!');
      setShowCreateModal(false);
      setFormData({ name: '', members: [] });
      loadRooms();
    } catch (error) {
      console.error('Failed to create room:', error);
      toast.error(error.message || 'Gagal membuat ruang chat');
    }
  };

  const toggleMember = (userId) => {
    setFormData(prev => {
      const members = prev.members.includes(userId)
        ? prev.members.filter(id => id !== userId)
        : [...prev.members, userId];
      return { ...prev, members };
    });
  };

  const filteredUsers = users
    .filter(u => u.id !== user.id)
    .filter(u => {
      if (!userSearchQuery) return true;
      const query = userSearchQuery.toLowerCase();
      return u.name.toLowerCase().includes(query) || 
             u.email.toLowerCase().includes(query);
    });

  const openEditModal = (room) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      members: room.members || []
    });
    setUserSearchQuery('');
    setShowEditModal(true);
  };

  const handleUpdateRoom = async (e) => {
    e.preventDefault();

    if (formData.members.length === 0) {
      toast.error('Ruang chat harus memiliki minimal 1 anggota');
      return;
    }

    try {
      await chatAPI.updateRoom(editingRoom.id, {
        name: formData.name,
        members: formData.members
      });
      toast.success('Ruang chat berhasil diupdate!');
      setShowEditModal(false);
      setEditingRoom(null);
      setFormData({ name: '', members: [] });
      loadRooms();
    } catch (error) {
      console.error('Failed to update room:', error);
      toast.error(error.message || 'Gagal mengupdate ruang chat');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !selectedRoom) return;

    const messageContent = newMessage.trim();
    setNewMessage(''); // Clear input immediately for better UX

    try {
      const message = {
        roomId: selectedRoom.id,
        content: messageContent
      };

      // Save message to database via API
      const response = await chatAPI.sendMessage(message);

      // Broadcast to other users via socket (server will handle deduplication)
      // The sender will receive the message back via socket 'new_message' event
      if (socket) {
        socket.emit('send_message', {
          ...message,
          id: response.data?.id, // Use the ID from API response if available
          userId: user.id,
          userEmail: user.email,
          createdAt: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Gagal mengirim pesan');
      // Restore message on error
      setNewMessage(messageContent);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Group Chat</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-1">Komunikasi dengan tim Anda secara real-time</p>
        </div>
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Buat Ruang Chat
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:w-full max-w-md">
            <DialogHeader>
              <DialogTitle>Buat Ruang Chat Baru</DialogTitle>
              <DialogDescription>
                Buat ruang diskusi baru untuk tim Anda
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <Label htmlFor="name">Nama Ruang Chat *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Tim Marketing, Diskusi Project"
                  required
                />
              </div>
              <div>
                <Label>Pilih Anggota * ({formData.members.length} dipilih)</Label>
                <Input
                  type="text"
                  placeholder="🔍 Cari nama atau email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="mt-2"
                />
                <ScrollArea className="h-[200px] border rounded-md p-3 mt-2">
                  <div className="space-y-2">
                    {filteredUsers.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        {userSearchQuery ? 'User tidak ditemukan' : 'Tidak ada user lain'}
                      </p>
                    ) : (
                      filteredUsers.map(u => (
                        <div key={u.id} className="flex items-center space-x-2 hover:bg-gray-50 p-2 rounded">
                          <Checkbox
                            id={`user-${u.id}`}
                            checked={formData.members.includes(u.id)}
                            onCheckedChange={() => toggleMember(u.id)}
                          />
                          <label
                            htmlFor={`user-${u.id}`}
                            className="flex-1 text-sm font-medium leading-none cursor-pointer"
                          >
                            <div className="font-semibold">{u.name}</div>
                            <div className="text-xs text-gray-500">{u.email}</div>
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Batal
                </Button>
                <Button type="submit">Buat</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Chat Interface */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Rooms List - Hidden on mobile when room is selected */}
        <Card className={`md:col-span-1 ${selectedRoom ? 'hidden md:block' : 'block'}`}>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Ruang Chat</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[400px] md:h-[calc(100vh-350px)]">
              {rooms.length === 0 ? (
                <div className="text-center py-8 px-4">
                  <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Belum ada ruang chat</p>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {rooms.map(room => (
                    <div
                      key={room.id}
                      className={`
                        p-3 rounded-lg transition-all relative group
                        ${selectedRoom?.id === room.id 
                          ? 'bg-blue-50 border-2 border-blue-500 shadow-sm' 
                          : 'bg-white border-2 border-gray-100 hover:border-blue-200 hover:shadow-sm'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3" onClick={() => setSelectedRoom(room)}>
                        <div className={`
                          p-2 rounded-full flex-shrink-0 cursor-pointer
                          ${selectedRoom?.id === room.id ? 'bg-blue-500' : 'bg-gray-200'}
                        `}>
                          <MessageCircle className={`w-4 h-4 ${selectedRoom?.id === room.id ? 'text-white' : 'text-gray-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer">
                          <p className={`font-semibold truncate text-sm ${selectedRoom?.id === room.id ? 'text-blue-900' : 'text-gray-900'}`}>
                            {room.name}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Users className="w-3 h-3" />
                              <span>{room.members?.length || 0}</span>
                            </div>
                            {room.lastMessage && (
                              <div className="flex items-center gap-1 text-xs text-gray-400">
                                <Clock className="w-3 h-3" />
                                <span>{new Date(room.lastMessage?.createdAt || room.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {user.role === 'super_admin' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(room);
                            }}
                            title="Edit Ruang Chat"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Messages Area - Show on mobile when room is selected, or always on desktop */}
        <Card className={`md:col-span-3 ${!selectedRoom ? 'hidden md:block' : 'block'}`}>
          {selectedRoom ? (
            <>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex-1">
                  <CardTitle className="text-base sm:text-lg">{selectedRoom.name}</CardTitle>
                  <p className="text-xs sm:text-sm text-gray-600">{selectedRoom.members?.length || 0} anggota</p>
                </div>
                {/* Back button for mobile */}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="md:hidden"
                  onClick={() => setSelectedRoom(null)}
                >
                  Kembali
                </Button>
              </CardHeader>
              <CardContent className="flex flex-col">
                {/* Messages */}
                <ScrollArea className="h-[400px] sm:h-[450px] md:h-[calc(100vh-350px)] pr-2 sm:pr-4 mb-4">
                  <div className="space-y-3 sm:space-y-4">
                    {messages.length === 0 ? (
                      <p className="text-center text-gray-500 py-4 text-sm">Belum ada pesan</p>
                    ) : (
                      messages.map((msg, idx) => {
                        const isOwn = msg.userId === user.id;
                        return (
                          <div key={idx} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] sm:max-w-[70%] ${isOwn ? 'bg-blue-600 text-white' : 'bg-gray-100'} rounded-lg p-2 sm:p-3`}>
                              {!isOwn && (
                                <p className="text-xs font-semibold mb-1 truncate">
                                  {msg.userEmail}
                                </p>
                              )}
                              <p className="text-sm break-words">{msg.content}</p>
                              <p className={`text-xs mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                                {new Date(msg.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Message Input */}
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Ketik pesan..."
                    className="flex-1 text-sm sm:text-base"
                  />
                  <Button type="submit" size="icon" className="flex-shrink-0">
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <CardContent className="h-[400px] md:h-full flex items-center justify-center">
              <p className="text-gray-500 text-sm sm:text-base">Pilih ruang chat untuk mulai berkomunikasi</p>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Edit Room Modal (Super Admin Only) */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Ruang Chat</DialogTitle>
            <DialogDescription>
              Ubah nama dan kelola anggota ruang chat
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateRoom} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nama Ruang Chat *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Contoh: Tim Marketing, Diskusi Project"
                required
              />
            </div>
            <div>
              <Label>Kelola Anggota * ({formData.members.length} dipilih)</Label>
              <Input
                type="text"
                placeholder="🔍 Cari nama atau email..."
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="mt-2"
              />
              <ScrollArea className="h-[200px] border rounded-md p-3 mt-2">
                <div className="space-y-2">
                  {filteredUsers.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      {userSearchQuery ? 'User tidak ditemukan' : 'Tidak ada user lain'}
                    </p>
                  ) : (
                    filteredUsers.map(u => {
                      const isCurrentMember = formData.members.includes(u.id);
                      return (
                        <div key={u.id} className="flex items-center space-x-2 hover:bg-gray-50 p-2 rounded">
                          <Checkbox
                            id={`edit-user-${u.id}`}
                            checked={isCurrentMember}
                            onCheckedChange={() => toggleMember(u.id)}
                          />
                          <label
                            htmlFor={`edit-user-${u.id}`}
                            className="flex-1 text-sm font-medium leading-none cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold">{u.name}</div>
                                <div className="text-xs text-gray-500">{u.email}</div>
                              </div>
                              {isCurrentMember && (
                                <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                                  Anggota
                                </span>
                              )}
                            </div>
                          </label>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Batal
              </Button>
              <Button type="submit">Update</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}