'use client';

import { useState, useEffect, useRef } from 'react';
import { initSocket } from '@/lib/socket-client';

export default function ScreenShareProvider({ user }) {
  const [isSharing, setIsSharing] = useState(false);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionsRef = useRef({});

  useEffect(() => {
    // Only for karyawan and sdm roles
    if (!user || !['karyawan', 'sdm'].includes(user.role)) return;

    const socket = initSocket();
    socketRef.current = socket;

    if (socket) {
      socket.on('monitor:offer', handleOffer);
      socket.on('monitor:ice-candidate', handleIceCandidate);

      // Notify server that this employee is online and available for monitoring
      socket.emit('monitor:screen-available', { userId: user.id });
    }

    return () => {
      stopScreenShare();
    };
  }, [user]);

  const startScreenShare = async () => {
    // If already sharing, skip
    if (streamRef.current) return streamRef.current;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', displaySurface: 'monitor' },
        audio: false
      });

      streamRef.current = stream;
      setIsSharing(true);

      // Handle stream ending (user clicks browser's stop sharing)
      stream.getVideoTracks()[0].onended = () => {
        streamRef.current = null;
        setIsSharing(false);
      };

      return stream;
    } catch (err) {
      console.log('[Monitor] Screen share denied:', err.message);
      return null;
    }
  };

  const stopScreenShare = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsSharing(false);
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
  };

  const handleOffer = async (data) => {
    // When admin connects, start screen share if not already active
    let stream = streamRef.current;
    if (!stream) {
      stream = await startScreenShare();
    }
    if (!stream) return; // User denied permission

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    peerConnectionsRef.current[data.sessionId] = pc;

    // Add screen share tracks
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('monitor:ice-candidate', {
          candidate: event.candidate,
          targetUserId: data.fromUserId,
          sessionId: data.sessionId
        });
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (socketRef.current) {
      socketRef.current.emit('monitor:answer', {
        answer,
        targetUserId: data.fromUserId,
        sessionId: data.sessionId
      });
    }
  };

  const handleIceCandidate = async (data) => {
    const pc = peerConnectionsRef.current[data.sessionId];
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  // Only show for karyawan/sdm roles
  if (!['karyawan', 'sdm'].includes(user?.role)) return null;

  // Always show "Monitor Aktif" indicator (no popup on login)
  return (
    <div className="fixed bottom-20 right-4 md:bottom-4 md:right-4 z-40">
      <div className="bg-green-50 border border-green-200 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
        </span>
        <span className="text-xs font-medium text-green-700">Monitor Aktif</span>
      </div>
    </div>
  );
}
