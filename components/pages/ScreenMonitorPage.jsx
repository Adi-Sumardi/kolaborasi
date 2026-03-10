'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Monitor, Wifi, WifiOff, X, Maximize2, Minimize2, Clock, User, Activity, CircleDot, Play, ScreenShare, ScreenShareOff } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/api';
import { initSocket } from '@/lib/socket-client';

export default function ScreenMonitorPage({ user }) {
  const [allEmployees, setAllEmployees] = useState([]);
  const [employeeActivities, setEmployeeActivities] = useState({});
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [connectingScreen, setConnectingScreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [monitorSource, setMonitorSource] = useState(null); // 'agent' | 'webrtc' | null
  const [tick, setTick] = useState(0);
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const videoContainerRef = useRef(null);
  const activeSessionIdRef = useRef(null);

  useEffect(() => {
    const socket = initSocket();
    socketRef.current = socket;

    if (socket) {
      const joinMonitor = () => {
        socket.emit('activity:join-monitor');
        socket.emit('activity:request-all');
      };

      if (socket.connected) {
        joinMonitor();
      }
      socket.on('connect', joinMonitor);

      socket.on('activity:update', (data) => {
        setEmployeeActivities(prev => ({
          ...prev,
          [data.userId]: {
            status: data.status,
            page: data.page,
            pageLabel: data.pageLabel,
            onlineSince: data.onlineSince,
            lastActivity: data.lastActivity,
            screenReady: data.screenReady || false,
            agentConnected: data.agentConnected || false,
            mood: data.mood || null,
            workStartedAt: data.workStartedAt || null
          }
        }));
      });

      socket.on('activity:all-data', (allData) => {
        setEmployeeActivities(allData || {});
      });

      // WebRTC handlers
      socket.on('monitor:answer', handleAnswer);
      socket.on('monitor:ice-candidate', handleIceCandidate);
    }

    loadEmployees();

    // Update duration display every 30 seconds
    const interval = setInterval(() => setTick(t => t + 1), 30000);

    return () => {
      clearInterval(interval);
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, []);

  const loadEmployees = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        const employees = (data.users || []).filter(u =>
          ['karyawan', 'sdm'].includes(u.role) && u.monitorCode
        );
        setAllEmployees(employees);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
    }
  };

  // --- Screen Viewing (auto-detect agent vs WebRTC) ---
  const handleStartScreenView = async (employee) => {
    const activity = getActivity(employee.id);

    // Prefer desktop agent if connected
    if (activity?.agentConnected) {
      startAgentView(employee);
      return;
    }

    // Fallback to WebRTC browser share
    if (!employee.monitorCode) {
      toast.error('Karyawan tidak memiliki kode monitor');
      return;
    }

    setConnectingScreen(true);
    try {
      const res = await fetch('/api/monitor/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ monitorCode: employee.monitorCode })
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Gagal terhubung');
        return;
      }

      activeSessionIdRef.current = data.session.id;
      await startWebRTC(employee.id, data.session.id);
      setIsScreenSharing(true);
      setMonitorSource('webrtc');
      toast.success(`Meminta screen share dari ${employee.name}...`);
    } catch (err) {
      toast.error('Gagal terhubung ke karyawan');
    } finally {
      setConnectingScreen(false);
    }
  };

  // --- Desktop Agent View ---
  const startAgentView = (employee) => {
    const socket = socketRef.current;
    if (!socket) return;

    setConnectingScreen(true);

    // Subscribe to this employee's desktop stream
    socket.emit('agent:watch', { targetUserId: employee.id, fps: 1 });

    // Listen for frames
    const frameHandler = (data) => {
      if (data.userId !== employee.id) return;
      const blob = new Blob([data.frame], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      if (imgRef.current) {
        const oldUrl = imgRef.current.src;
        imgRef.current.src = url;
        if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
      }
    };

    socket.on('agent:frame', frameHandler);
    socket._agentFrameHandler = frameHandler;

    setIsScreenSharing(true);
    setMonitorSource('agent');
    setConnectingScreen(false);
    toast.success(`Terhubung ke desktop ${employee.name}`);
  };

  const stopAgentView = () => {
    const socket = socketRef.current;
    if (socket && selectedEmployee) {
      socket.emit('agent:unwatch', { targetUserId: selectedEmployee.id });
      if (socket._agentFrameHandler) {
        socket.off('agent:frame', socket._agentFrameHandler);
        socket._agentFrameHandler = null;
      }
    }
    // Clean up blob URLs
    if (imgRef.current && imgRef.current.src?.startsWith('blob:')) {
      URL.revokeObjectURL(imgRef.current.src);
      imgRef.current.src = '';
    }
  };

  const startWebRTC = async (targetUserId, sessionId) => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    peerConnectionRef.current = pc;

    pc.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('monitor:ice-candidate', {
          candidate: event.candidate,
          targetUserId,
          sessionId
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        toast.error('Koneksi screen share terputus');
        setIsScreenSharing(false);
      }
    };

    pc.addTransceiver('video', { direction: 'recvonly' });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (socketRef.current) {
      socketRef.current.emit('monitor:offer', {
        offer,
        targetUserId,
        sessionId
      });
    }
  };

  const handleAnswer = async (data) => {
    // Only accept answer for our active session
    if (data.sessionId && data.sessionId !== activeSessionIdRef.current) return;
    const pc = peerConnectionRef.current;
    if (pc && pc.signalingState === 'have-local-offer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (err) {
        console.error('Failed to set remote description:', err);
      }
    }
  };

  const handleIceCandidate = async (data) => {
    if (data.sessionId && data.sessionId !== activeSessionIdRef.current) return;
    const pc = peerConnectionRef.current;
    if (pc && pc.signalingState !== 'closed') {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    }
  };

  const handleStopScreenView = () => {
    // Stop agent view if active
    if (monitorSource === 'agent') {
      stopAgentView();
    }
    // Stop WebRTC if active
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    activeSessionIdRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScreenSharing(false);
    setMonitorSource(null);
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!isFullscreen) {
      videoContainerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  // --- Helpers ---
  const getActivity = (empId) => employeeActivities[empId] || null;

  const getStatusInfo = (empId) => {
    const activity = getActivity(empId);
    if (!activity) return { label: 'Offline', color: 'bg-gray-400', textColor: 'text-gray-500', dotColor: 'bg-gray-100' };
    switch (activity.status) {
      case 'online':
        return { label: 'Online', color: 'bg-green-500', textColor: 'text-green-600', dotColor: 'bg-green-100' };
      case 'idle':
        return { label: 'Idle', color: 'bg-amber-400', textColor: 'text-amber-600', dotColor: 'bg-amber-100' };
      default:
        return { label: 'Offline', color: 'bg-gray-400', textColor: 'text-gray-500', dotColor: 'bg-gray-100' };
    }
  };

  const formatDuration = (sinceDate) => {
    if (!sinceDate) return '-';
    const diff = Date.now() - new Date(sinceDate).getTime();
    if (diff < 0) return '-';
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}j ${minutes}m`;
    return `${minutes}m`;
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'karyawan': return 'Karyawan';
      case 'sdm': return 'SDM';
      default: return role;
    }
  };

  const getMoodEmoji = (mood) => {
    switch (mood) {
      case 'semangat': return '💪';
      case 'senang': return '😊';
      case 'biasa': return '😐';
      case 'lelah': return '😴';
      case 'sedih': return '😢';
      default: return null;
    }
  };

  // Sort: online first, then idle, then offline
  const sortedEmployees = [...allEmployees].sort((a, b) => {
    const statusOrder = { online: 0, idle: 1, offline: 2 };
    const aStatus = getActivity(a.id)?.status || 'offline';
    const bStatus = getActivity(b.id)?.status || 'offline';
    return (statusOrder[aStatus] || 2) - (statusOrder[bStatus] || 2);
  });

  const onlineCount = allEmployees.filter(e => getActivity(e.id)?.status === 'online').length;
  const idleCount = allEmployees.filter(e => getActivity(e.id)?.status === 'idle').length;
  const agentCount = allEmployees.filter(e => getActivity(e.id)?.agentConnected).length;
  const screenReadyCount = allEmployees.filter(e => getActivity(e.id)?.screenReady || getActivity(e.id)?.agentConnected).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Monitor className="w-6 h-6" />
            Monitor Karyawan
          </h1>
          <p className="text-gray-500 text-sm mt-1">Pantau aktivitas karyawan secara real-time</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-green-600 border-green-300 gap-1">
            <CircleDot className="w-3 h-3" /> {onlineCount} Online
          </Badge>
          <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
            <CircleDot className="w-3 h-3" /> {idleCount} Idle
          </Badge>
          <Badge variant="outline" className="text-blue-600 border-blue-300 gap-1">
            <ScreenShare className="w-3 h-3" /> {screenReadyCount} Layar Aktif
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Employee List */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Daftar Karyawan ({allEmployees.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sortedEmployees.length === 0 ? (
                <div className="text-center py-8 text-gray-500 px-4">
                  <WifiOff className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Tidak ada karyawan</p>
                </div>
              ) : (
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {sortedEmployees.map((emp) => {
                    const isSelected = selectedEmployee?.id === emp.id;
                    const status = getStatusInfo(emp.id);
                    const activity = getActivity(emp.id);

                    return (
                      <div
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployee(emp);
                          if (isScreenSharing && selectedEmployee?.id !== emp.id) {
                            handleStopScreenView();
                          }
                        }}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                          isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                        }`}
                      >
                        <div className="relative">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${status.dotColor}`}>
                            <Monitor className={`w-4 h-4 ${status.textColor}`} />
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${status.color} border-2 border-white rounded-full`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {emp.name}
                            {activity?.mood && getMoodEmoji(activity.mood) && (
                              <span className="ml-1">{getMoodEmoji(activity.mood)}</span>
                            )}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{getRoleLabel(emp.role)}</span>
                            {activity && activity.status !== 'offline' && (
                              <>
                                <span>·</span>
                                <span className={status.textColor}>{activity.pageLabel || 'Dashboard'}</span>
                              </>
                            )}
                          </div>
                          {activity?.agentConnected ? (
                            <div className="flex items-center gap-1 text-xs text-purple-600 mt-0.5">
                              <Monitor className="w-3 h-3" />
                              <span>Desktop Agent aktif</span>
                            </div>
                          ) : activity?.screenReady ? (
                            <div className="flex items-center gap-1 text-xs text-blue-600 mt-0.5">
                              <ScreenShare className="w-3 h-3" />
                              <span>Layar siap dipantau</span>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={`text-xs ${
                            status.label === 'Online' ? 'bg-green-100 text-green-700' :
                            status.label === 'Idle' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {status.label}
                          </Badge>
                          {activity?.onlineSince && activity.status !== 'offline' && (
                            <span className="text-xs text-gray-400">{formatDuration(activity.onlineSince)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Detail + Screen View */}
        <div className="lg:col-span-2 space-y-4">
          {!selectedEmployee ? (
            <Card>
              <CardContent className="py-16">
                <div className="text-center text-gray-500">
                  <Monitor className="w-16 h-16 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-400">Pilih karyawan untuk melihat detail</p>
                  <p className="text-sm text-gray-400 mt-1">Klik nama karyawan di daftar sebelah kiri</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Activity Detail Card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      {selectedEmployee.name}
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => { setSelectedEmployee(null); handleStopScreenView(); }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const activity = getActivity(selectedEmployee.id);
                    const status = getStatusInfo(selectedEmployee.id);
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Status</p>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${status.color}`} />
                            <span className={`font-medium text-sm ${status.textColor}`}>{status.label}</span>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Mood</p>
                          <p className="font-medium text-sm">
                            {activity?.mood ? `${getMoodEmoji(activity.mood) || ''} ${activity.mood.charAt(0).toUpperCase() + activity.mood.slice(1)}` : '-'}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Halaman Aktif</p>
                          <p className="font-medium text-sm">{activity?.pageLabel || '-'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Durasi Online</p>
                          <p className="font-medium text-sm">{activity?.onlineSince && activity.status !== 'offline' ? formatDuration(activity.onlineSince) : '-'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500 mb-1">Monitor Layar</p>
                          <div className="flex items-center gap-1.5">
                            {activity?.agentConnected ? (
                              <>
                                <Monitor className="w-4 h-4 text-purple-600" />
                                <span className="font-medium text-sm text-purple-600">Desktop Agent</span>
                              </>
                            ) : activity?.screenReady ? (
                              <>
                                <ScreenShare className="w-4 h-4 text-blue-600" />
                                <span className="font-medium text-sm text-blue-600">Browser Share</span>
                              </>
                            ) : (
                              <>
                                <ScreenShareOff className="w-4 h-4 text-gray-400" />
                                <span className="font-medium text-sm text-gray-400">Tidak aktif</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Screen Share Button */}
                  <div className="mt-4 flex items-center gap-3">
                    {!isScreenSharing ? (
                      <Button
                        onClick={() => handleStartScreenView(selectedEmployee)}
                        disabled={connectingScreen || getStatusInfo(selectedEmployee.id).label === 'Offline'}
                        className="gap-2"
                      >
                        <Play className="w-4 h-4" />
                        {connectingScreen ? 'Menghubungkan...' : 'Lihat Layar'}
                      </Button>
                    ) : (
                      <Button variant="destructive" onClick={handleStopScreenView} className="gap-2">
                        <X className="w-4 h-4" />
                        Tutup Layar
                      </Button>
                    )}
                    {!isScreenSharing && getStatusInfo(selectedEmployee.id).label === 'Offline' && (
                      <span className="text-xs text-gray-400">Karyawan sedang offline</span>
                    )}
                    {!isScreenSharing && getStatusInfo(selectedEmployee.id).label !== 'Offline' && getActivity(selectedEmployee.id)?.agentConnected && (
                      <span className="text-xs text-purple-600">Desktop Agent aktif — seluruh desktop tanpa popup</span>
                    )}
                    {!isScreenSharing && getStatusInfo(selectedEmployee.id).label !== 'Offline' && !getActivity(selectedEmployee.id)?.agentConnected && getActivity(selectedEmployee.id)?.screenReady && (
                      <span className="text-xs text-green-600">Browser share siap — langsung terhubung</span>
                    )}
                    {!isScreenSharing && getStatusInfo(selectedEmployee.id).label !== 'Offline' && !getActivity(selectedEmployee.id)?.agentConnected && !getActivity(selectedEmployee.id)?.screenReady && (
                      <span className="text-xs text-gray-400">Karyawan akan diminta izin 1x oleh browser</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Video Player (only when screen sharing) */}
              {isScreenSharing && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Wifi className="w-5 h-5 text-green-500" />
                        Live Screen - {selectedEmployee.name}
                        <Badge variant="outline" className="text-green-600 border-green-300">Live</Badge>
                        {monitorSource === 'agent' && (
                          <Badge variant="outline" className="text-purple-600 border-purple-300">Desktop Agent</Badge>
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
                          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleStopScreenView}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div ref={videoContainerRef} className="bg-gray-900 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
                      {monitorSource === 'agent' ? (
                        <img
                          ref={imgRef}
                          className="w-full h-full object-contain"
                          alt="Desktop"
                        />
                      ) : (
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Terhubung sejak: {new Date().toLocaleTimeString('id-ID')}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {selectedEmployee.email}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
