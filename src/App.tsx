import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { generateRoomCode } from './lib/codeGen';
import type { Room, Player } from './types';
import { Header } from './components/Header';
import { SetupBanner } from './components/SetupBanner';
import { LandingView } from './components/LandingView';
import { LobbyView } from './components/LobbyView';
import { VotingView } from './components/VotingView';
import { RevealedView } from './components/RevealedView';

const STORAGE_KEY = 'fireteam_ballot_session';

// Tab-unique ID so multiple tabs of the same player don't conflict
function getTabId(): string {
  let id = sessionStorage.getItem('fireteam_ballot_tab_id');
  if (!id) {
    id = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    sessionStorage.setItem('fireteam_ballot_tab_id', id);
  }
  return id;
}

// Helper to prevent requests from hanging indefinitely
function withTimeout<T>(promise: Promise<T>, ms = 6000, errorMsg = 'Operation timed out.'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

export function App() {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(
    () => Boolean(isSupabaseConfigured && localStorage.getItem(STORAGE_KEY))
  );
  const [error, setError] = useState<string | null>(null);
  const [onlinePlayerIds, setOnlinePlayerIds] = useState<Set<string>>(new Set());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentPlayerRef = useRef<Player | null>(null);
  const roomRef = useRef<Room | null>(null);
  const disconnectTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
    roomRef.current = room;
  }, [currentPlayer, room]);

  // Fetch all players currently in the room
  const fetchRoomPlayers = useCallback(async (roomId: string) => {
    try {
      const { data, error: fetchErr } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });

      if (fetchErr) throw fetchErr;
      if (data) {
        setPlayers(data as Player[]);
        if (currentPlayerRef.current) {
          const freshCurrent = (data as Player[]).find((p) => p.id === currentPlayerRef.current?.id);
          if (freshCurrent) {
            setCurrentPlayer(freshCurrent);
          }
        }
      }
    } catch (err: unknown) {
      console.error('Failed to fetch fireteam players:', err);
    }
  }, []);

  // Restore existing session on mount
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let isMounted = true;

    async function restoreSession() {
      const savedSession = localStorage.getItem(STORAGE_KEY);
      if (!savedSession) {
        if (isMounted) setIsRestoringSession(false);
        return;
      }

      try {
        const { roomId, playerId } = JSON.parse(savedSession);
        if (!roomId || !playerId) {
          if (isMounted) setIsRestoringSession(false);
          return;
        }

        const { data: roomData, error: roomErr } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .maybeSingle();

        if (roomErr || !roomData) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        // 1. Client-side last-seen check: if this device closed the room > 30s ago, purge it!
        const lastSeen = localStorage.getItem(`fireteam_ballot_last_seen_${roomId}`);
        const closedAt = localStorage.getItem(`fireteam_ballot_closed_at_${roomId}`);
        const refTime = closedAt ? Number(closedAt) : (lastSeen ? Number(lastSeen) : null);

        if (refTime && Date.now() - refTime > 30000) {
          try {
            await supabase.from('rooms').delete().eq('id', roomId);
          } catch {
            // ignore
          }
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(`fireteam_ballot_last_seen_${roomId}`);
          localStorage.removeItem(`fireteam_ballot_closed_at_${roomId}`);
          if (isMounted) {
            setError('Fireteam room was killed because all players were disconnected for more than 30 seconds.');
            setIsRestoringSession(false);
          }
          return;
        }

        // 2. Server-side heartbeat check: if no active tab updated heartbeat in > 30s, purge room!
        const { data: heartbeat } = await supabase
          .from('history')
          .select('picked_at')
          .eq('room_id', roomId)
          .eq('raid_id', '__HEARTBEAT__')
          .order('picked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let isExpired = false;
        if (heartbeat?.picked_at) {
          if (Date.now() - new Date(heartbeat.picked_at).getTime() > 30000) {
            isExpired = true;
          }
        } else if (roomData.created_at) {
          if (Date.now() - new Date(roomData.created_at).getTime() > 35000) {
            isExpired = true;
          }
        }

        if (isExpired) {
          try {
            await supabase.from('rooms').delete().eq('id', roomId);
          } catch {
            // ignore
          }
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(`fireteam_ballot_last_seen_${roomId}`);
          localStorage.removeItem(`fireteam_ballot_closed_at_${roomId}`);
          if (isMounted) {
            setError('Fireteam room was killed because all players were disconnected for more than 30 seconds.');
            setIsRestoringSession(false);
          }
          return;
        }

        const { data: playerData, error: playerErr } = await supabase
          .from('players')
          .select('*')
          .eq('id', playerId)
          .maybeSingle();

        if (playerErr || !playerData) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        if (isMounted) {
          setRoom(roomData as Room);
          setCurrentPlayer(playerData as Player);
          fetchRoomPlayers(roomId);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        if (isMounted) {
          setIsRestoringSession(false);
        }
      }
    }

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [fetchRoomPlayers]);

  // Set up Supabase Realtime channel (Dual sync: Broadcast for 10ms speed + Postgres changes for backup)
  useEffect(() => {
    if (!isSupabaseConfigured || !room?.id || !currentPlayer?.id) return;

    const roomId = room.id;
    const currentId = currentPlayer.id;
    let isSubscribed = true;

    // Fetch initial roster immediately
    supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true })
      .then(({ data }) => {
        if (isSubscribed && data) setPlayers(data as Player[]);
      });

    const tabId = getTabId();

    // Check if a player still has at least one active tab in the room
    const isPlayerActiveInAnyTab = (targetPlayerId: string): boolean => {
      if (!channelRef.current) return false;
      const state = channelRef.current.presenceState();
      for (const presences of Object.values(state)) {
        if (Array.isArray(presences)) {
          for (const p of presences) {
            if ((p as { playerId?: string }).playerId === targetPlayerId) {
              return true;
            }
          }
        }
      }
      return false;
    };

    const channel = supabase.channel(`room-sync:${roomId}`, {
      config: {
        presence: {
          key: tabId,
        },
      },
    });

    channelRef.current = channel;

    const updateOnlinePresence = () => {
      if (!channelRef.current) return;
      const state = channelRef.current.presenceState();
      const online = new Set<string>();
      if (currentId) online.add(currentId);
      for (const presences of Object.values(state)) {
        if (Array.isArray(presences)) {
          for (const p of presences) {
            const pid = (p as { playerId?: string }).playerId;
            if (pid) online.add(pid);
          }
        }
      }
      setOnlinePlayerIds(online);
    };

    channel
      // 1. FAST BROADCAST: Instant peer-to-peer relay for room status changes
      .on('broadcast', { event: 'room_status' }, ({ payload }) => {
        if (payload?.status) {
          setRoom((prev) => (prev ? { ...prev, status: payload.status } : null));
        }
      })
      // 2. FAST BROADCAST: Instant roster reload when a player joins or leaves
      .on('broadcast', { event: 'roster_sync' }, () => {
        fetchRoomPlayers(roomId);
      })
      // 3. FAST BROADCAST: Instant ballot lock indicator update
      .on('broadcast', { event: 'player_locked' }, () => {
        fetchRoomPlayers(roomId);
      })
      // 4. FAST BROADCAST: Instant kick detection
      .on('broadcast', { event: 'player_kicked' }, ({ payload }) => {
        if (payload?.playerId === currentId) {
          localStorage.removeItem(STORAGE_KEY);
          setRoom(null);
          setCurrentPlayer(null);
          setPlayers([]);
          setError('You were removed from the fireteam by the leader.');
        } else if (payload?.playerId) {
          setPlayers((prev) => prev.filter((p) => p.id !== payload.playerId));
        }
      })
      // 5. FAST BROADCAST: Room disbanded
      .on('broadcast', { event: 'room_disbanded' }, () => {
        localStorage.removeItem(STORAGE_KEY);
        setRoom(null);
        setCurrentPlayer(null);
        setPlayers([]);
        setError('Fireteam leader left. Room has been disbanded.');
      })
      // 6. FAST BROADCAST: Leadership transferred to new host
      .on('broadcast', { event: 'host_transferred' }, ({ payload }) => {
        if (payload?.newHostId) {
          setRoom((prev) => (prev ? { ...prev, host_player_id: payload.newHostId } : null));
          setCurrentPlayer((prev) =>
            prev ? { ...prev, is_host: prev.id === payload.newHostId } : null
          );
          fetchRoomPlayers(roomId);
        }
      })
      // 7. PRESENCE TRACKING: Detect connected/disconnected players live
      .on('presence', { event: 'sync' }, () => {
        updateOnlinePresence();
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        updateOnlinePresence();
        // If a player reconnected or opened another tab, cancel any pending disconnect timer
        for (const presence of newPresences) {
          const joinedId = (presence as { playerId?: string }).playerId;
          if (joinedId && disconnectTimers.current.has(joinedId)) {
            clearTimeout(disconnectTimers.current.get(joinedId)!);
            disconnectTimers.current.delete(joinedId);
          }
          if (joinedId === roomRef.current?.host_player_id && disconnectTimers.current.has('HOST_DISCONNECT')) {
            clearTimeout(disconnectTimers.current.get('HOST_DISCONNECT')!);
            disconnectTimers.current.delete('HOST_DISCONNECT');
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        updateOnlinePresence();

        for (const presence of leftPresences) {
          const leftPlayerId = (presence as { playerId?: string }).playerId;
          if (!leftPlayerId) continue;

          // Multi-tab check: If player is still active in another open tab, do NOT handle disconnect!
          if (isPlayerActiveInAnyTab(leftPlayerId)) {
            continue;
          }

          // Case A: Fireteam leader closed all tabs:
          // Give leader a generous 30s grace period to refresh or recover before transferring leadership
          if (leftPlayerId === roomRef.current?.host_player_id && leftPlayerId !== currentId) {
            if (!disconnectTimers.current.has('HOST_DISCONNECT')) {
              const timer = setTimeout(async () => {
                disconnectTimers.current.delete('HOST_DISCONNECT');
                if (isPlayerActiveInAnyTab(leftPlayerId)) {
                  return;
                }

                // Host never returned after 30s! Check remaining players
                const { data: currentRoster } = await supabase
                  .from('players')
                  .select('*')
                  .eq('room_id', roomId)
                  .order('joined_at', { ascending: true });

                const remaining = (currentRoster || []).filter((p) => p.id !== leftPlayerId);
                const onlineRemaining = remaining.filter((p) => isPlayerActiveInAnyTab(p.id));

                if (onlineRemaining.length === 0) {
                  // ALL players in room are disconnected for > 30 seconds! Kill room in DB!
                  try {
                    await supabase.from('rooms').delete().eq('id', roomId);
                  } catch (err) {
                    console.error('Failed to kill abandoned room:', err);
                  }
                  localStorage.removeItem(STORAGE_KEY);
                  setRoom(null);
                  setCurrentPlayer(null);
                  setPlayers([]);
                  setError('All players disconnected for more than 30 seconds. Room has been killed.');
                  return;
                }

                const newHost = onlineRemaining[0] || remaining[0];
                if (currentPlayerRef.current?.id === newHost.id) {
                  await supabase.from('players').update({ is_host: true }).eq('id', newHost.id);
                  await supabase.from('rooms').update({ host_player_id: newHost.id }).eq('id', roomId);
                  await supabase.from('players').delete().eq('id', leftPlayerId);
                  setCurrentPlayer((prev) => (prev ? { ...prev, is_host: true } : null));
                  setRoom((prev) => (prev ? { ...prev, host_player_id: newHost.id } : null));
                  channelRef.current?.send({
                    type: 'broadcast',
                    event: 'host_transferred',
                    payload: { newHostId: newHost.id, newHostName: newHost.name },
                  });
                  fetchRoomPlayers(roomId);
                }
              }, 30000);
              disconnectTimers.current.set('HOST_DISCONNECT', timer);
            }
            return;
          }

          // Case B: Non-host player closed all tabs:
          // If in voting or revealed, DO NOT auto-kick! Keep their record and votes safe.
          // Only in lobby do we schedule a 60s cleanup timer if they abandon the session.
          const isLobby = roomRef.current?.status === 'lobby';
          if (isLobby && currentPlayerRef.current?.is_host && leftPlayerId !== currentId) {
            if (!disconnectTimers.current.has(leftPlayerId)) {
              const timer = setTimeout(async () => {
                disconnectTimers.current.delete(leftPlayerId);

                if (isPlayerActiveInAnyTab(leftPlayerId) || roomRef.current?.status !== 'lobby') {
                  return;
                }

                await supabase.from('players').delete().eq('id', leftPlayerId);
                fetchRoomPlayers(roomId);
                channelRef.current?.send({
                  type: 'broadcast',
                  event: 'roster_sync',
                });
              }, 60000); // 60s grace period in lobby
              disconnectTimers.current.set(leftPlayerId, timer);
            }
          }
        }
      })
      // 8. POSTGRES WAL BACKUP: In case direct DB changes happen
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          fetchRoomPlayers(roomId);
          if (
            payload.eventType === 'DELETE' &&
            payload.old &&
            (payload.old as { id: string }).id === currentId
          ) {
            localStorage.removeItem(STORAGE_KEY);
            setRoom(null);
            setCurrentPlayer(null);
            setPlayers([]);
            setError('You were removed from the fireteam by the leader.');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => {
          localStorage.removeItem(STORAGE_KEY);
          setRoom(null);
          setCurrentPlayer(null);
          setPlayers([]);
          setError('Fireteam leader disbanded the room.');
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            setRoom(payload.new as Room);
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && isSubscribed) {
          await channel.track({
            tabId,
            playerId: currentId,
            name: currentPlayer.name,
            isHost: currentPlayer.is_host,
          });
          updateOnlinePresence();
          // Initial heartbeat
          localStorage.setItem(`fireteam_ballot_last_seen_${roomId}`, Date.now().toString());
          supabase.from('history').insert({
            room_id: roomId,
            raid_id: '__HEARTBEAT__',
            picked_at: new Date().toISOString(),
          });
        }
      });

    // Periodic heartbeat every 10 seconds while tab is active
    const heartbeatTimer = setInterval(async () => {
      if (!isSubscribed) return;
      localStorage.setItem(`fireteam_ballot_last_seen_${roomId}`, Date.now().toString());
      try {
        await supabase.from('history').delete().eq('room_id', roomId).eq('raid_id', '__HEARTBEAT__');
        await supabase.from('history').insert({
          room_id: roomId,
          raid_id: '__HEARTBEAT__',
          picked_at: new Date().toISOString(),
        });
      } catch {
        // ignore
      }
    }, 10000);

    // Synchronously track close/unload time in localStorage
    const handleBeforeUnload = () => {
      localStorage.setItem(`fireteam_ballot_closed_at_${roomId}`, Date.now().toString());
      localStorage.setItem(`fireteam_ballot_last_seen_${roomId}`, Date.now().toString());
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      isSubscribed = false;
      clearInterval(heartbeatTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [room?.id, currentPlayer?.id, currentPlayer?.name, currentPlayer?.is_host, fetchRoomPlayers]);

  // Action: Create Room (Optimized single insert)
  const handleCreateRoom = async (hostName: string) => {
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Follow setup instructions above.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await withTimeout(
        (async () => {
          let code = generateRoomCode();
          let createdRoom: Room | null = null;

          // Attempt insertion with random code (retries only on duplicate code)
          for (let i = 0; i < 3; i++) {
            const { data, error: roomErr } = await supabase
              .from('rooms')
              .insert({ code, status: 'lobby' })
              .select()
              .single();

            if (!roomErr && data) {
              createdRoom = data as Room;
              break;
            }
            code = generateRoomCode();
          }

          if (!createdRoom) {
            throw new Error('Failed to generate room code. Please try again.');
          }

          // Register host player
          const { data: createdPlayer, error: playerErr } = await supabase
            .from('players')
            .insert({
              room_id: createdRoom.id,
              name: hostName,
              is_host: true,
            })
            .select()
            .single();

          if (playerErr || !createdPlayer) {
            throw new Error(playerErr?.message || 'Failed to register fireteam leader.');
          }

          // Link host_player_id
          await supabase
            .from('rooms')
            .update({ host_player_id: createdPlayer.id })
            .eq('id', createdRoom.id);

          const completeRoom: Room = {
            ...createdRoom,
            host_player_id: createdPlayer.id,
          };

          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ roomId: completeRoom.id, playerId: createdPlayer.id })
          );

          setRoom(completeRoom);
          setCurrentPlayer(createdPlayer as Player);
          setPlayers([createdPlayer as Player]);
        })(),
        7000,
        'Server took too long to create room. Please check your Supabase connection.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error during room creation.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Join Room (Optimized joined query)
  const handleJoinRoom = async (code: string, playerName: string) => {
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured yet. Follow setup instructions above.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await withTimeout(
        (async () => {
          // Fetch room and existing player IDs in ONE single network query
          const { data: targetRoom, error: roomErr } = await supabase
            .from('rooms')
            .select('*, players(id, name, is_host)')
            .eq('code', code.toUpperCase())
            .maybeSingle();

          if (roomErr || !targetRoom) {
            throw new Error(`Room code [${code}] not found. Check with your fireteam.`);
          }

          if (targetRoom.status !== 'lobby') {
            throw new Error('This fireteam has already initiated voting or deployed.');
          }

          // Check if room was abandoned / all players disconnected for > 30s
          const { data: heartbeat } = await supabase
            .from('history')
            .select('picked_at')
            .eq('room_id', targetRoom.id)
            .eq('raid_id', '__HEARTBEAT__')
            .order('picked_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let isExpired = false;
          if (heartbeat?.picked_at) {
            if (Date.now() - new Date(heartbeat.picked_at).getTime() > 30000) {
              isExpired = true;
            }
          } else if (targetRoom.created_at) {
            if (Date.now() - new Date(targetRoom.created_at).getTime() > 35000) {
              isExpired = true;
            }
          }

          if (isExpired) {
            try {
              await supabase.from('rooms').delete().eq('id', targetRoom.id);
            } catch {
              // ignore
            }
            throw new Error(`Room [${code}] was closed because all players were disconnected for more than 30 seconds.`);
          }

          const existingPlayers = Array.isArray(targetRoom.players) ? targetRoom.players : [];
          const hasHost = existingPlayers.some((p: { is_host?: boolean }) => p.is_host);
          if (!hasHost || !targetRoom.host_player_id) {
            await supabase.from('rooms').delete().eq('id', targetRoom.id);
            throw new Error(`Room [${code}] was disbanded because the host left.`);
          }

          // Block duplicate Guardian names (case-insensitive)
          const nameExists = existingPlayers.some(
            (p: { name?: string }) => p.name?.trim().toLowerCase() === playerName.trim().toLowerCase()
          );
          if (nameExists) {
            throw new Error(`Callsign "${playerName}" is already taken in this fireteam. Please pick a distinct name.`);
          }

          const existingCount = existingPlayers.length;
          if (existingCount >= 6) {
            throw new Error('Fireteam is at maximum capacity (6/6 Guardians).');
          }

          // Add player to room
          const { data: createdPlayer, error: playerErr } = await supabase
            .from('players')
            .insert({
              room_id: targetRoom.id,
              name: playerName,
              is_host: false,
            })
            .select()
            .single();

          if (playerErr || !createdPlayer) {
            throw new Error(playerErr?.message || 'Failed to join fireteam.');
          }

          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ roomId: targetRoom.id, playerId: createdPlayer.id })
          );

          setRoom(targetRoom as Room);
          setCurrentPlayer(createdPlayer as Player);
          fetchRoomPlayers(targetRoom.id);

          // Broadcast roster sync to existing members
          channelRef.current?.send({
            type: 'broadcast',
            event: 'roster_sync',
          });
        })(),
        7000,
        'Server took too long to join room. Please check your Supabase connection.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error joining room.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Host Starts Voting (Instant broadcast + DB persist)
  const handleStartVoting = async () => {
    if (!room || !currentPlayer?.is_host) return;

    // 1. Optimistic instant local update
    setRoom((prev) => (prev ? { ...prev, status: 'voting' } : null));
    setCurrentPlayer((prev) => (prev ? { ...prev, has_locked: false, veto_used: false } : null));
    setPlayers((prev) => prev.map((p) => ({ ...p, has_locked: false, veto_used: false })));

    // 2. Instant broadcast to all other open tabs (10ms)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'room_status',
      payload: { status: 'voting' },
    });
    channelRef.current?.send({
      type: 'broadcast',
      event: 'roster_sync',
    });

    // 3. Persist to database in background
    try {
      await Promise.all([
        supabase.from('rooms').update({ status: 'voting' }).eq('id', room.id),
        supabase.from('players').update({ has_locked: false, veto_used: false }).eq('room_id', room.id),
        supabase.from('votes').delete().eq('room_id', room.id),
        supabase.from('vetoes').delete().eq('room_id', room.id),
      ]);
    } catch (err) {
      console.error('Failed to update room status in DB:', err);
    }
  };

  // Action: Return to Lobby (Instant broadcast + DB persist)
  const handleReturnToLobby = async () => {
    if (!room) return;

    // 1. Optimistic instant local update
    setRoom((prev) => (prev ? { ...prev, status: 'lobby' } : null));
    setCurrentPlayer((prev) => (prev ? { ...prev, has_locked: false, veto_used: false } : null));
    setPlayers((prev) => prev.map((p) => ({ ...p, has_locked: false, veto_used: false })));

    // 2. Instant broadcast to all other open tabs
    channelRef.current?.send({
      type: 'broadcast',
      event: 'room_status',
      payload: { status: 'lobby' },
    });
    channelRef.current?.send({
      type: 'broadcast',
      event: 'roster_sync',
    });

    // 3. Persist to database
    try {
      await Promise.all([
        supabase.from('rooms').update({ status: 'lobby' }).eq('id', room.id),
        supabase.from('players').update({ has_locked: false, veto_used: false }).eq('room_id', room.id),
        supabase.from('votes').delete().eq('room_id', room.id),
        supabase.from('vetoes').delete().eq('room_id', room.id),
      ]);
    } catch (err) {
      console.error('Failed to update room status in DB:', err);
    }
  };

  // Action: Host Kicks a Player (Instant broadcast + DB delete + auto-proceed check)
  const handleKickPlayer = async (targetPlayerId: string) => {
    if (!room || !currentPlayer?.is_host) return;

    // 1. Optimistic local update
    const remainingPlayers = players.filter((p) => p.id !== targetPlayerId);
    setPlayers(remainingPlayers);

    // 2. Instant broadcast kick to all tabs
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_kicked',
      payload: { playerId: targetPlayerId },
    });

    // 3. Delete from DB (player, votes, vetoes)
    try {
      await Promise.all([
        supabase.from('players').delete().eq('id', targetPlayerId),
        supabase.from('votes').delete().eq('room_id', room.id).eq('player_id', targetPlayerId),
        supabase.from('vetoes').delete().eq('room_id', room.id).eq('player_id', targetPlayerId),
      ]);

      // 4. Fetch updated roster to check state
      const { data: updatedPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', room.id)
        .order('joined_at', { ascending: true });

      if (updatedPlayers && updatedPlayers.length > 0) {
        setPlayers(updatedPlayers as Player[]);

        // 5. If in voting: check if all remaining members have voted!
        if (room.status === 'voting') {
          const allLocked = updatedPlayers.every((p) => p.has_locked);
          if (allLocked) {
            // Everyone remaining has locked in! Advance automatically to reveal!
            await supabase.from('rooms').update({ status: 'revealed' }).eq('id', room.id);
            setRoom((prev) => (prev ? { ...prev, status: 'revealed' } : null));
            channelRef.current?.send({
              type: 'broadcast',
              event: 'room_status',
              payload: { status: 'revealed' },
            });
          }
        }
      }

      channelRef.current?.send({
        type: 'broadcast',
        event: 'roster_sync',
      });
    } catch (err) {
      console.error('Failed to kick player in DB:', err);
    }
  };

  // Action: Host Disbands / Kills Room
  const handleDisbandRoom = async () => {
    if (!room || !currentPlayer?.is_host) return;

    if (!window.confirm('Are you sure you want to kill and disband this room? All data will be deleted.')) {
      return;
    }

    try {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'room_disbanded',
      });
      await supabase.from('rooms').delete().eq('id', room.id);
    } catch (err) {
      console.error('Error disbanding room:', err);
    }

    localStorage.removeItem(STORAGE_KEY);
    setRoom(null);
    setCurrentPlayer(null);
    setPlayers([]);
    setError('Fireteam room killed and disbanded.');
  };

  // Action: Lock In Ballot and Veto
  const handleLockIn = async (scores: Record<string, number>, vetoRaidId: string | null) => {
    if (!room || !currentPlayer || currentPlayer.has_locked) return;

    setIsLoading(true);
    setError(null);

    try {
      await withTimeout(
        (async () => {
          // 1. Insert/upsert votes for each raid
          const voteRows = Object.entries(scores).map(([raidId, score]) => ({
            room_id: room.id,
            player_id: currentPlayer.id,
            raid_id: raidId,
            score,
          }));

          const { error: votesErr } = await supabase.from('votes').upsert(voteRows, {
            onConflict: 'room_id,player_id,raid_id',
          });
          if (votesErr) throw votesErr;

          // 2. Insert/upsert veto if specified
          if (vetoRaidId) {
            const { error: vetoErr } = await supabase.from('vetoes').upsert(
              {
                room_id: room.id,
                player_id: currentPlayer.id,
                raid_id: vetoRaidId,
              },
              { onConflict: 'room_id,player_id' }
            );
            if (vetoErr) throw vetoErr;
          }

          // 3. Update player has_locked and veto_used in DB
          const { error: playerErr } = await supabase
            .from('players')
            .update({
              has_locked: true,
              veto_used: Boolean(vetoRaidId),
            })
            .eq('id', currentPlayer.id);
          if (playerErr) throw playerErr;

          // 4. Update local player state
          setCurrentPlayer((prev) =>
            prev ? { ...prev, has_locked: true, veto_used: Boolean(vetoRaidId) } : null
          );

          // 5. Broadcast lock-in event to all other clients
          channelRef.current?.send({
            type: 'broadcast',
            event: 'player_locked',
            payload: { playerId: currentPlayer.id },
          });

          // 6. Check if everyone is now locked in
          const { data: updatedPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('room_id', room.id);

          if (updatedPlayers) {
            setPlayers(updatedPlayers as Player[]);
            const allLocked = updatedPlayers.every((p) => p.has_locked);
            if (allLocked && updatedPlayers.length > 0) {
              await supabase.from('rooms').update({ status: 'revealed' }).eq('id', room.id);
              setRoom((prev) => (prev ? { ...prev, status: 'revealed' } : null));
              channelRef.current?.send({
                type: 'broadcast',
                event: 'room_status',
                payload: { status: 'revealed' },
              });
            }
          }
        })(),
        8000,
        'Sealing ballot timed out. Please try locking in again.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to lock in ballot.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Force Advance to Reveal
  const handleForceAdvance = async () => {
    if (!room || !currentPlayer?.is_host) return;

    setIsLoading(true);
    try {
      await supabase.from('rooms').update({ status: 'revealed' }).eq('id', room.id);
      setRoom((prev) => (prev ? { ...prev, status: 'revealed' } : null));
      channelRef.current?.send({
        type: 'broadcast',
        event: 'room_status',
        payload: { status: 'revealed' },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to advance to reveal.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Reset Ballots to Revote
  const handleResetToVoting = async () => {
    if (!room || !currentPlayer?.is_host) return;

    setIsLoading(true);
    try {
      await Promise.all([
        supabase.from('players').update({ has_locked: false, veto_used: false }).eq('room_id', room.id),
        supabase.from('votes').delete().eq('room_id', room.id),
        supabase.from('vetoes').delete().eq('room_id', room.id),
        supabase.from('rooms').update({ status: 'voting' }).eq('id', room.id),
      ]);

      setRoom((prev) => (prev ? { ...prev, status: 'voting' } : null));
      setCurrentPlayer((prev) => (prev ? { ...prev, has_locked: false, veto_used: false } : null));
      setPlayers((prev) => prev.map((p) => ({ ...p, has_locked: false, veto_used: false })));

      channelRef.current?.send({
        type: 'broadcast',
        event: 'room_status',
        payload: { status: 'voting' },
      });
      channelRef.current?.send({
        type: 'broadcast',
        event: 'roster_sync',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset ballot.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Action: Leave Room
  const handleLeaveRoom = async () => {
    if (currentPlayer && room) {
      try {
        if (currentPlayer.is_host) {
          const otherPlayers = players.filter((p) => p.id !== currentPlayer.id);
          if (otherPlayers.length > 0) {
            const nextHost = otherPlayers[0];
            await supabase.from('players').update({ is_host: true }).eq('id', nextHost.id);
            await supabase.from('rooms').update({ host_player_id: nextHost.id }).eq('id', room.id);
            await supabase.from('players').delete().eq('id', currentPlayer.id);
            channelRef.current?.send({
              type: 'broadcast',
              event: 'host_transferred',
              payload: { newHostId: nextHost.id, newHostName: nextHost.name },
            });
            channelRef.current?.send({
              type: 'broadcast',
              event: 'roster_sync',
            });
          } else {
            channelRef.current?.send({
              type: 'broadcast',
              event: 'room_disbanded',
            });
            await supabase.from('rooms').delete().eq('id', room.id);
          }
        } else {
          await supabase.from('players').delete().eq('id', currentPlayer.id);
          channelRef.current?.send({
            type: 'broadcast',
            event: 'roster_sync',
          });
        }
      } catch (err) {
        console.error('Error leaving room:', err);
      }
    }

    localStorage.removeItem(STORAGE_KEY);
    setRoom(null);
    setCurrentPlayer(null);
    setPlayers([]);
    setError(null);
  };

  return (
    <div className="app-container">
      <Header
        roomCode={room?.code}
        onLeave={room ? handleLeaveRoom : undefined}
      />

      <main style={{ flex: 1 }}>
        {!isSupabaseConfigured && <SetupBanner />}

        {isRestoringSession ? (
          <div
            className="panel-card"
            style={{
              maxWidth: '460px',
              margin: '80px auto',
              textAlign: 'center',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '10px' }}>
              [SYS] RESTORING FIRETEAM FREQUENCY
            </div>
            <h2 style={{ fontSize: '1.35rem', marginBottom: '8px' }}>RECONNECTING SESSION</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Syncing tactical telemetry with fireteam roster...
            </p>
          </div>
        ) : !room || !currentPlayer ? (
          <LandingView
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            isLoading={isLoading}
            error={error}
          />
        ) : room.status === 'lobby' ? (
          <LobbyView
            room={room}
            players={players}
            currentPlayer={currentPlayer}
            onlinePlayerIds={onlinePlayerIds}
            onStartVoting={handleStartVoting}
            onKickPlayer={handleKickPlayer}
            onDisbandRoom={handleDisbandRoom}
            isLoading={isLoading}
          />
        ) : room.status === 'voting' ? (
          <VotingView
            room={room}
            players={players}
            currentPlayer={currentPlayer}
            onlinePlayerIds={onlinePlayerIds}
            onLockIn={handleLockIn}
            onForceAdvance={handleForceAdvance}
            onReturnToLobby={handleReturnToLobby}
            onKickPlayer={handleKickPlayer}
            onDisbandRoom={handleDisbandRoom}
            isLoading={isLoading}
          />
        ) : (
          <RevealedView
            room={room}
            players={players}
            currentPlayer={currentPlayer}
            onlinePlayerIds={onlinePlayerIds}
            onResetToVoting={handleResetToVoting}
            onReturnToLobby={handleReturnToLobby}
            onDisbandRoom={handleDisbandRoom}
            isLoading={isLoading}
          />
        )}
      </main>
    </div>
  );
}

export default App;
