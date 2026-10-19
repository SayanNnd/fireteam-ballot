import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { generateRoomCode } from './lib/codeGen';
import type { Room, Player } from './types';
import { Header } from './components/Header';
import { SetupBanner } from './components/SetupBanner';
import { LandingView } from './components/LandingView';
import { LobbyView } from './components/LobbyView';

const STORAGE_KEY = 'raid_picker_fireteam_session';

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
  const [error, setError] = useState<string | null>(null);

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
      if (data) setPlayers(data as Player[]);
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
      if (!savedSession) return;

      try {
        const { roomId, playerId } = JSON.parse(savedSession);
        if (!roomId || !playerId) return;

        const { data: roomData, error: roomErr } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .maybeSingle();

        if (roomErr || !roomData) {
          localStorage.removeItem(STORAGE_KEY);
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

    const channel = supabase.channel(`room-sync:${roomId}`, {
      config: {
        presence: {
          key: currentId,
        },
      },
    });

    channelRef.current = channel;

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
      // 3. FAST BROADCAST: Instant kick detection
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
      // 4. PRESENCE TRACKING: Detect disconnected / closed tabs with grace period
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        // If a player reconnected (e.g. refreshed the page), cancel any pending disconnect timer
        for (const presence of newPresences) {
          const joinedId = (presence as { playerId?: string }).playerId;
          if (joinedId && disconnectTimers.current.has(joinedId)) {
            clearTimeout(disconnectTimers.current.get(joinedId)!);
            disconnectTimers.current.delete(joinedId);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        // When a player's tab closes or socket drops
        for (const presence of leftPresences) {
          const leftPlayerId = (presence as { playerId?: string }).playerId;
          if (!leftPlayerId) continue;

          // If the leader left, inform other players
          if (leftPlayerId === roomRef.current?.host_player_id && leftPlayerId !== currentId) {
            localStorage.removeItem(STORAGE_KEY);
            setRoom(null);
            setCurrentPlayer(null);
            setPlayers([]);
            setError('Fireteam leader disconnected. Room session ended.');
            return;
          }

          // If current client is the host and a non-host player left:
          if (currentPlayerRef.current?.is_host && leftPlayerId !== currentId) {
            // Give 4 seconds grace period so page refreshes don't kick players!
            if (!disconnectTimers.current.has(leftPlayerId)) {
              const timer = setTimeout(async () => {
                disconnectTimers.current.delete(leftPlayerId);
                // Purge disconnected player from database
                await supabase.from('players').delete().eq('id', leftPlayerId);
                fetchRoomPlayers(roomId);
                channelRef.current?.send({
                  type: 'broadcast',
                  event: 'roster_sync',
                });
              }, 4000);
              disconnectTimers.current.set(leftPlayerId, timer);
            }
          }
        }
      })
      // 5. POSTGRES WAL BACKUP: In case any direct DB changes happen
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
            playerId: currentId,
            name: currentPlayer.name,
            isHost: currentPlayer.is_host,
          });
        }
      });

    return () => {
      isSubscribed = false;
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
            .select('*, players(id)')
            .eq('code', code.toUpperCase())
            .maybeSingle();

          if (roomErr || !targetRoom) {
            throw new Error(`Room code [${code}] not found. Check with your fireteam.`);
          }

          if (targetRoom.status !== 'lobby') {
            throw new Error('This fireteam has already initiated voting or deployed.');
          }

          const existingCount = Array.isArray(targetRoom.players) ? targetRoom.players.length : 0;
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

    // 2. Instant broadcast to all other open tabs (10ms)
    channelRef.current?.send({
      type: 'broadcast',
      event: 'room_status',
      payload: { status: 'voting' },
    });

    // 3. Persist to database in background
    try {
      await supabase.from('rooms').update({ status: 'voting' }).eq('id', room.id);
    } catch (err) {
      console.error('Failed to update room status in DB:', err);
    }
  };

  // Action: Return to Lobby (Instant broadcast + DB persist)
  const handleReturnToLobby = async () => {
    if (!room) return;

    // 1. Optimistic instant local update
    setRoom((prev) => (prev ? { ...prev, status: 'lobby' } : null));

    // 2. Instant broadcast to all other open tabs
    channelRef.current?.send({
      type: 'broadcast',
      event: 'room_status',
      payload: { status: 'lobby' },
    });

    // 3. Persist to database
    try {
      await supabase.from('rooms').update({ status: 'lobby' }).eq('id', room.id);
    } catch (err) {
      console.error('Failed to update room status in DB:', err);
    }
  };

  // Action: Host Kicks a Player (Instant broadcast + DB delete)
  const handleKickPlayer = async (targetPlayerId: string) => {
    if (!room || !currentPlayer?.is_host) return;

    // 1. Optimistic local update
    setPlayers((prev) => prev.filter((p) => p.id !== targetPlayerId));

    // 2. Instant broadcast kick to all tabs
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_kicked',
      payload: { playerId: targetPlayerId },
    });

    // 3. Delete from DB
    try {
      await supabase.from('players').delete().eq('id', targetPlayerId);
    } catch (err) {
      console.error('Failed to kick player in DB:', err);
    }
  };

  // Action: Leave Room
  const handleLeaveRoom = async () => {
    if (currentPlayer && room) {
      try {
        await supabase.from('players').delete().eq('id', currentPlayer.id);
        channelRef.current?.send({
          type: 'broadcast',
          event: 'roster_sync',
        });
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

        {!room || !currentPlayer ? (
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
            onStartVoting={handleStartVoting}
            onKickPlayer={handleKickPlayer}
            isLoading={isLoading}
          />
        ) : (
          /* Transition for voting state */
          <div className="panel-card" style={{ borderColor: 'var(--gold)' }}>
            <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '8px' }}>
              [STAGE: VOTING PHASE INITIATED]
            </div>
            <h2>LOCK-IN PROTOCOL ACTIVE</h2>
            <p style={{ color: 'var(--text-muted)', margin: '12px 0 20px', fontSize: '0.95rem' }}>
              All {players.length} Guardians in fireteam [{room.code}] are transitioning to private voting.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-sm"
                onClick={handleReturnToLobby}
              >
                RETURN TO LOBBY (TEST)
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
