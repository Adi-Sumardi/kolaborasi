'use client';

import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { chatAPI, userAPI } from '@/lib/api';
import { Plus, Send } from 'lucide-react';
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
  const [formData, setFormData] = useState({ name: '', members: [] });
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

      // Listen for new messages
      const handleNewMessage = (message) => {
        if (message.roomId === selectedRoom.id) {
          setMessages(prev => [...prev, message]);
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

    try {
      await chatAPI.createRoom({
        name: formData.name,
        members: [],
        type: 'group'
      });
      toast.success('Ruang chat berhasil dibuat!');
      setShowCreateModal(false);
      setFormData({ name: '' });
      loadRooms();
    } catch (error) {
      console.error('Failed to create room:', error);
      toast.error(error.message || 'Gagal membuat ruang chat');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !selectedRoom) return;

    try {
      const message = {
        roomId: selectedRoom.id,
        content: newMessage
      };

      await chatAPI.sendMessage(message);
      
      if (socket) {
        socket.emit('send_message', {
          ...message,
          userId: user.id,
          userEmail: user.email,
          createdAt: new Date()
        });
      }

      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Gagal mengirim pesan');
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
                  onChange={(e) => setFormData({ name: e.target.value })}
                  placeholder="Contoh: Tim Marketing, Diskusi Project"
                  required
                />
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
                <p className="text-center text-gray-500 py-4 px-4 text-sm">Belum ada ruang chat</p>
              ) : (
                <div className="space-y-1 p-2">
                  {rooms.map(room => (
                    <Button
                      key={room.id}
                      variant={selectedRoom?.id === room.id ? 'secondary' : 'ghost'}
                      className="w-full justify-start text-left"
                      onClick={() => setSelectedRoom(room)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{room.name}</p>
                        <p className="text-xs text-gray-500">{room.members?.length || 0} anggota</p>
                      </div>
                    </Button>
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
    </div>
  );
}