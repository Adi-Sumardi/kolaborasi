'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Bell, 
  LogOut, 
  Home, 
  ClipboardList, 
  BarChart3, 
  Users, 
  MessageSquare, 
  CheckSquare, 
  Settings
} from 'lucide-react';
import { 
  getUser, 
  removeToken, 
  removeUser, 
  authAPI, 
  jobdeskAPI,
  notificationAPI
} from '@/lib/api';
import { toast } from 'sonner';
import { initSocket, disconnectSocket } from '@/lib/socket-client';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Import page components
import DashboardHome from './pages/DashboardHome';
import JobdeskPage from './pages/JobdeskPage';
import KPIPage from './pages/KPIPage';
import DivisionPage from './pages/DivisionPage';
import ChatPage from './pages/ChatPage';
import TodoPage from './pages/TodoPage';
import SettingsPage from './pages/SettingsPage';
import UserManagementPage from './pages/UserManagementPage';

export default function DashboardApp({ setIsLoggedIn }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showJobdeskModal, setShowJobdeskModal] = useState(false);
  const [checkingJobdesks, setCheckingJobdesks] = useState(true);

  useEffect(() => {
    const user = getUser();
    setCurrentUser(user);

    // Fetch current user info
    authAPI.getMe().then(userData => {
      setCurrentUser(userData);
    }).catch(err => {
      console.error('Failed to fetch user:', err);
    });

    // Initialize Socket.io
    const socketInstance = initSocket();
    if (socketInstance) {
      setSocket(socketInstance);

      // Listen for notifications
      socketInstance.on('notification', (notification) => {
        setNotifications(prev => [notification, ...prev]);
        toast.info(notification.title, { description: notification.message });
      });
    }

    // Fetch initial notifications
    notificationAPI.getAll().then(data => {
      setNotifications(data.notifications || []);
    }).catch(err => {
      console.error('Failed to fetch notifications:', err);
    });

    // Check if user has jobdesks (for karyawan)
    if (user && user.role === 'karyawan') {
      jobdeskAPI.getAll().then(data => {
        const jobdesks = data.jobdesks || [];
        setCheckingJobdesks(false);
        if (jobdesks.length === 0) {
          setShowJobdeskModal(true);
        }
      }).catch(err => {
        console.error('Failed to check jobdesks:', err);
        setCheckingJobdesks(false);
      });
    } else {
      setCheckingJobdesks(false);
    }

    return () => {
      disconnectSocket();
    };
  }, []);

  const handleLogout = () => {
    removeToken();
    removeUser();
    disconnectSocket();
    setIsLoggedIn(false);
    toast.success('Logout berhasil');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: Home, roles: ['super_admin', 'pengurus', 'sdm', 'karyawan'] },
    { id: 'jobdesk', label: 'Jobdesk', icon: ClipboardList, roles: ['super_admin', 'pengurus', 'sdm', 'karyawan'] },
    { id: 'kpi', label: 'KPI', icon: BarChart3, roles: ['super_admin', 'pengurus', 'sdm', 'karyawan'] },
    { id: 'users', label: 'User', icon: Users, roles: ['super_admin', 'pengurus'] },
    { id: 'divisions', label: 'Divisi', icon: Users, roles: ['super_admin', 'pengurus', 'sdm'] },
    { id: 'chat', label: 'Chat', icon: MessageSquare, roles: ['super_admin', 'pengurus', 'sdm', 'karyawan'] },
    { id: 'todo', label: 'To-Do', icon: CheckSquare, roles: ['super_admin', 'pengurus', 'sdm', 'karyawan'] },
    { id: 'settings', label: 'Pengaturan', icon: Settings, roles: ['super_admin', 'pengurus', 'sdm', 'karyawan'] },
  ];

  const filteredMenuItems = currentUser 
    ? menuItems.filter(item => item.roles.includes(currentUser.role))
    : [];

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <DashboardHome user={currentUser} />;
      case 'jobdesk':
        return <JobdeskPage user={currentUser} />;
      case 'kpi':
        return <KPIPage user={currentUser} />;
      case 'users':
        return <UserManagementPage user={currentUser} />;
      case 'divisions':
        return <DivisionPage user={currentUser} />;
      case 'chat':
        return <ChatPage user={currentUser} socket={socket} />;
      case 'todo':
        return <TodoPage user={currentUser} />;
      case 'settings':
        return <SettingsPage user={currentUser} />;
      default:
        return <DashboardHome user={currentUser} />;
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-100 text-purple-800';
      case 'pengurus': return 'bg-blue-100 text-blue-800';
      case 'sdm': return 'bg-green-100 text-green-800';
      case 'karyawan': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'pengurus': return 'Pengurus';
      case 'sdm': return 'SDM';
      case 'karyawan': return 'Karyawan';
      default: return role;
    }
  };

  if (!currentUser || checkingJobdesks) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-600">Memuat...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Title */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Workspace</h1>
                  <p className="text-xs text-gray-500">Sistem Kolaborasi</p>
                </div>
              </div>
            </div>

            {/* Navigation Menu */}
            <nav className="hidden md:flex items-center space-x-1">
              {filteredMenuItems.map(item => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant={currentPage === item.id ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setCurrentPage(item.id)}
                    className="flex items-center space-x-2"
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </nav>

            {/* Right Side */}
            <div className="flex items-center space-x-3">
              {/* Notifications */}
              <DropdownMenu open={showNotifications} onOpenChange={setShowNotifications}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Notifikasi</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">
                        Tidak ada notifikasi
                      </div>
                    ) : (
                      notifications.slice(0, 10).map(notif => (
                        <DropdownMenuItem
                          key={notif.id}
                          className="flex flex-col items-start p-3 cursor-pointer"
                          onClick={() => {
                            if (!notif.read) {
                              notificationAPI.markAsRead(notif.id).catch(err => {
                                console.error('Failed to mark as read:', err);
                              });
                              setNotifications(prev => 
                                prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
                              );
                            }
                          }}
                        >
                          <div className="flex items-start justify-between w-full">
                            <p className="font-semibold text-sm">{notif.title}</p>
                            {!notif.read && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full mt-1" />
                            )}
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{notif.message}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(notif.createdAt).toLocaleString('id-ID')}
                          </p>
                        </DropdownMenuItem>
                      ))
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center space-x-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-blue-600 text-white">
                        {currentUser.name?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden lg:block text-left">
                      <p className="text-sm font-medium">{currentUser.name}</p>
                      <Badge className={`text-xs ${getRoleBadgeColor(currentUser.role)}`}>
                        {getRoleLabel(currentUser.role)}
                      </Badge>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div>
                      <p className="font-semibold">{currentUser.name}</p>
                      <p className="text-xs text-gray-500">{currentUser.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setCurrentPage('settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Pengaturan
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 sm:p-6 lg:p-8">
        {renderPage()}
      </main>

      {/* Jobdesk Modal untuk Karyawan */}
      {currentUser.role === 'karyawan' && (
        <Dialog open={showJobdeskModal} onOpenChange={setShowJobdeskModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Selamat Datang!</DialogTitle>
              <DialogDescription>
                Anda belum memiliki jobdesk. Silakan hubungi pengurus atau admin untuk mendapatkan jobdesk Anda.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end space-x-2 mt-4">
              <Button onClick={() => setShowJobdeskModal(false)}>
                Mengerti
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex justify-around">
          {filteredMenuItems.slice(0, 5).map(item => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={currentPage === item.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setCurrentPage(item.id)}
                className="flex flex-col items-center space-y-1 h-auto py-2"
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
