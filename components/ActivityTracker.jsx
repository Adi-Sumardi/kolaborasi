'use client';

import { useState, useEffect, useRef } from 'react';
import { getSocket, initSocket } from '@/lib/socket-client';
import { workSessionAPI } from '@/lib/api';

const IDLE_TIMEOUT = 2 * 60 * 1000; // 2 minutes

export default function ActivityTracker({ user, currentPage, pageLabel, isWorking, workStartTime }) {
  const [elapsed, setElapsed] = useState('');
  const [todayTotal, setTodayTotal] = useState(null);
  const [isMonitored, setIsMonitored] = useState(false);
  const streamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const idleTimerRef = useRef(null);
  const isIdleRef = useRef(false);
  const socketRef = useRef(null);
  const currentPageRef = useRef(currentPage);
  const pageLabelRef = useRef(pageLabel);
  const listenersSetRef = useRef(false);

  currentPageRef.current = currentPage;
  pageLabelRef.current = pageLabel;

  // Get or wait for socket
  useEffect(() => {
    if (!user || !['karyawan', 'sdm'].includes(user.role)) return;

    let destroyed = false;
    let pollTimer = null;
    let watchStateSock = null;

    // Indikator "Aktif dan dipantau" — karyawan berhak tahu layarnya sedang dilihat
    const onWatchState = (data) => setIsMonitored(!!data?.watching);
    const onMonitorStopped = () => setIsMonitored(false);

    const setup = () => {
      let sock = getSocket() || initSocket();
      if (!sock || destroyed) return false;

      socketRef.current = sock;

      if (!watchStateSock) {
        watchStateSock = sock;
        sock.on('monitor:watch-state', onWatchState);
        sock.on('monitor:stopped', onMonitorStopped);
        // Tanyakan status saat ini (mis. setelah refresh halaman)
        if (sock.connected) sock.emit('monitor:watch-state?');
        sock.on('connect', () => sock.emit('monitor:watch-state?'));
      }

      // Only register WebRTC listeners once
      if (!listenersSetRef.current) {
        listenersSetRef.current = true;

        // Track if we're currently handling an offer to prevent duplicate popups
        let handlingOffer = false;

        sock.on('monitor:offer', async (data) => {
          if (handlingOffer) return;
          if (peerConnectionsRef.current[data.sessionId]) return;

          handlingOffer = true;

          try {
            // Reuse existing stream if still active
            let stream = streamRef.current;
            if (stream) {
              const videoTrack = stream.getVideoTracks()[0];
              if (!videoTrack || videoTrack.readyState === 'ended') {
                streamRef.current = null;
                stream = null;
              }
            }

            // Only ask for permission if no active stream (1x popup per session)
            if (!stream) {
              stream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false,
                preferCurrentTab: true
              });
              streamRef.current = stream;

              // Notify server screen is now ready
              if (sock?.connected) {
                sock.emit('monitor:screen-ready');
              }

              stream.getVideoTracks()[0].onended = () => {
                streamRef.current = null;
                // Close all peer connections
                Object.values(peerConnectionsRef.current).forEach(pc => {
                  if (pc.connectionState !== 'closed') pc.close();
                });
                peerConnectionsRef.current = {};
                if (sock?.connected) {
                  sock.emit('monitor:screen-stopped');
                }
              };
            }

            // Close any old peer connections
            Object.values(peerConnectionsRef.current).forEach(oldPc => {
              if (oldPc.connectionState !== 'closed') oldPc.close();
            });
            peerConnectionsRef.current = {};

            const pc = new RTCPeerConnection({
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            });
            peerConnectionsRef.current[data.sessionId] = pc;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.onicecandidate = (event) => {
              if (event.candidate && sock) {
                sock.emit('monitor:ice-candidate', {
                  candidate: event.candidate,
                  targetUserId: data.fromUserId,
                  sessionId: data.sessionId
                });
              }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sock.emit('monitor:answer', {
              answer,
              targetUserId: data.fromUserId,
              sessionId: data.sessionId
            });
          } catch (err) {
            console.log('[Monitor] Screen share error:', err.message);
          } finally {
            handlingOffer = false;
          }
        });

        sock.on('monitor:ice-candidate', async (data) => {
          const pc = peerConnectionsRef.current[data.sessionId];
          if (pc) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
              console.log('[Monitor] ICE candidate error:', err.message);
            }
          }
        });
      }

      return true;
    };

    // Poll until socket available
    const poll = () => {
      if (destroyed) return;
      if (!setup()) {
        pollTimer = setTimeout(poll, 500);
      }
    };
    poll();

    return () => {
      destroyed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (watchStateSock) {
        watchStateSock.off('monitor:watch-state', onWatchState);
        watchStateSock.off('monitor:stopped', onMonitorStopped);
        watchStateSock = null;
      }
    };
  }, [user]);

  // Track page changes
  useEffect(() => {
    if (socketRef.current?.connected && user && ['karyawan', 'sdm'].includes(user.role)) {
      socketRef.current.emit('activity:page-change', {
        userId: user.id,
        page: currentPage,
        pageLabel: pageLabel
      });
    }
  }, [currentPage, pageLabel]);

  // Idle detection
  useEffect(() => {
    if (!user || !['karyawan', 'sdm'].includes(user.role)) return;

    const resetIdleTimer = () => {
      if (isIdleRef.current && socketRef.current?.connected) {
        isIdleRef.current = false;
        socketRef.current.emit('activity:active', { userId: user.id });
      }
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        isIdleRef.current = true;
        if (socketRef.current?.connected) {
          socketRef.current.emit('activity:idle', { userId: user.id });
        }
      }, IDLE_TIMEOUT);
    };

    resetIdleTimer();
    document.addEventListener('mousemove', resetIdleTimer);
    document.addEventListener('keydown', resetIdleTimer);
    document.addEventListener('click', resetIdleTimer);

    return () => {
      document.removeEventListener('mousemove', resetIdleTimer);
      document.removeEventListener('keydown', resetIdleTimer);
      document.removeEventListener('click', resetIdleTimer);
      clearTimeout(idleTimerRef.current);
    };
  }, [user]);

  // Elapsed timer
  useEffect(() => {
    if (!workStartTime) return;
    const timer = setInterval(() => {
      const diff = Date.now() - workStartTime;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(h > 0 ? `${h}j ${m}m ${s}d` : `${m}m ${s}d`);
    }, 1000);
    return () => clearInterval(timer);
  }, [workStartTime]);

  // Fetch today's total work hours
  useEffect(() => {
    if (!isWorking || !user) return;
    const today = new Date().toISOString().split('T')[0];
    workSessionAPI.getSessions({ date: today }).then(data => {
      if (data.summary) {
        setTodayTotal(data.summary.totalFormatted);
      }
    }).catch(() => {});

    // Refresh every 5 minutes
    const refreshTimer = setInterval(() => {
      workSessionAPI.getSessions({ date: today }).then(data => {
        if (data.summary) setTodayTotal(data.summary.totalFormatted);
      }).catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(refreshTimer);
  }, [isWorking, user]);

  if (!['karyawan', 'sdm'].includes(user?.role)) return null;
  // Indikator dipantau harus tetap muncul walau karyawan belum "Mulai Bekerja"
  if (!isWorking && !isMonitored) return null;

  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  return (
    <>
      {/* Indikator dipantau sengaja di atas overlay modal (z-50) dan prompt PWA.
          Ini informasi transparansi — karyawan harus selalu bisa melihatnya,
          termasuk saat modal sambutan sedang terbuka. */}
      {isMonitored && (
        <div className="fixed top-[72px] right-4 z-[60] pointer-events-none">
          <div className="bg-blue-600 rounded-full pl-2.5 pr-3 py-1.5 flex items-center gap-2 shadow-lg ring-2 ring-white/70">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="text-xs font-semibold text-white whitespace-nowrap">Aktif dan dipantau</span>
          </div>
        </div>
      )}

      {isWorking && (
        <div className="fixed bottom-20 right-4 md:bottom-4 md:right-4 z-40">
          <div className="bg-white border border-green-200 rounded-2xl px-4 py-2.5 flex items-center gap-2 shadow-lg">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-green-700">Sedang Bekerja</span>
              {elapsed && <span className="text-[10px] text-gray-500">Sesi: {elapsed}</span>}
              {todayTotal && <span className="text-[10px] text-blue-600 font-medium">Hari ini: {todayTotal}</span>}
              {isElectron && <span className="text-[9px] text-orange-500">App harus tetap terbuka</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
