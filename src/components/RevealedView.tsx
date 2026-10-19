import React, { useEffect, useState, useRef } from 'react';
import type { Room, Player } from '../types';
import { supabase } from '../lib/supabase';
import raids from '../data/raids';
import { pickRaid, calculateRaidWeights, type VoteInput, type VetoInput, type HistoryInput } from '../lib/pick';

interface RevealedViewProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onlinePlayerIds: Set<string>;
  onResetToVoting: () => Promise<void>;
  onReturnToLobby: () => Promise<void>;
  onDisbandRoom?: () => Promise<void>;
  onPickDetermined?: (pickedRaidId: string) => void;
  onReroll?: () => Promise<void>;
  isLoading: boolean;
}

const getIsoTimestamp = () => new Date().toISOString();

export const RevealedView: React.FC<RevealedViewProps> = ({
  room,
  players,
  currentPlayer,
  onlinePlayerIds,
  onResetToVoting,
  onReturnToLobby,
  onDisbandRoom,
  onPickDetermined,
  onReroll,
  isLoading,
}) => {
  const [vetoes, setVetoes] = useState<{ player_id: string; raid_id: string }[]>([]);
  const [votes, setVotes] = useState<{ player_id: string; raid_id: string; score: number }[]>([]);
  const [history, setHistory] = useState<{ raid_id: string; picked_at: string }[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const hasExecutedPick = useRef(false);

  // 1. Fetch all votes, vetoes, and room history from Supabase
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [vetoesRes, votesRes, historyRes] = await Promise.all([
          supabase.from('vetoes').select('player_id, raid_id').eq('room_id', room.id),
          supabase.from('votes').select('player_id, raid_id, score').eq('room_id', room.id),
          supabase
            .from('history')
            .select('raid_id, picked_at')
            .eq('room_id', room.id)
            .order('picked_at', { ascending: false }),
        ]);

        if (!isMounted) return;

        if (vetoesRes.data) setVetoes(vetoesRes.data);
        if (votesRes.data) setVotes(votesRes.data);
        if (historyRes.data) {
          // Filter out internal system heartbeat records
          const realHistory = historyRes.data.filter((h) => !h.raid_id.startsWith('__'));
          setHistory(realHistory);
        }
        setIsDataLoaded(true);
      } catch (err) {
        console.error('Error loading ballot outcomes:', err);
        if (isMounted) setIsDataLoaded(true);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [room.id]);

  // 2. Authoritative Pick Selection: Host executes pick, or oldest online player if host is offline
  useEffect(() => {
    if (!isDataLoaded || room.picked_raid_id || hasExecutedPick.current) return;

    const voteInputs: VoteInput[] = votes.map((v) => ({ raid_id: v.raid_id, score: v.score }));
    const vetoInputs: VetoInput[] = vetoes.map((v) => ({ raid_id: v.raid_id }));
    const historyInputs: HistoryInput[] = history.map((h) => ({ raid_id: h.raid_id, picked_at: h.picked_at }));

    // Check if current player is designated authority to write the pick
    const isHost = currentPlayer.is_host;
    const isHostOnline = onlinePlayerIds.has(room.host_player_id || '');
    const onlineRemaining = players.filter((p) => onlinePlayerIds.has(p.id) || p.id === currentPlayer.id);
    const isOldestOnline = onlineRemaining.length > 0 && onlineRemaining[0].id === currentPlayer.id;

    const shouldExecutePick = isHost || (!isHostOnline && isOldestOnline);

    if (shouldExecutePick) {
      hasExecutedPick.current = true;
      const result = pickRaid(raids, voteInputs, vetoInputs, historyInputs);
      const chosenId = result.pickedRaid?.id || '__EMPTY_POOL__';

      (async () => {
        setIsPicking(true);
        try {
          const { error: updateErr } = await supabase
            .from('rooms')
            .update({ picked_raid_id: chosenId })
            .eq('id', room.id)
            .is('picked_raid_id', null);

          if (!updateErr && result.pickedRaid) {
            const pickedAt = getIsoTimestamp();
            await supabase.from('history').insert({
              room_id: room.id,
              raid_id: result.pickedRaid.id,
              picked_at: pickedAt,
            });

            setHistory((prev) => [{ raid_id: result.pickedRaid!.id, picked_at: pickedAt }, ...prev]);

            if (onPickDetermined) {
              onPickDetermined(chosenId);
            }
          }
        } catch (err) {
          console.error('Failed to write authoritative pick:', err);
        } finally {
          setIsPicking(false);
        }
      })();
    }
  }, [
    isDataLoaded,
    room.id,
    room.picked_raid_id,
    room.host_player_id,
    votes,
    vetoes,
    history,
    currentPlayer.is_host,
    currentPlayer.id,
    onlinePlayerIds,
    players,
    onPickDetermined,
  ]);

  // 3. Compute probability distribution weights for display
  const voteInputs: VoteInput[] = votes.map((v) => ({ raid_id: v.raid_id, score: v.score }));
  const vetoInputs: VetoInput[] = vetoes.map((v) => ({ raid_id: v.raid_id }));
  const historyInputs: HistoryInput[] = history.map((h) => ({ raid_id: h.raid_id, picked_at: h.picked_at }));

  const { eligibleRaids, weights, vetoedRaidIds } = calculateRaidWeights(
    raids,
    voteInputs,
    vetoInputs,
    historyInputs
  );

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);

  // Map picked raid from ID
  const pickedRaidId = room.picked_raid_id;
  const isPoolEmpty = pickedRaidId === '__EMPTY_POOL__' || (isDataLoaded && eligibleRaids.length === 0);
  const pickedRaid = raids.find((r) => r.id === pickedRaidId) || null;

  const pickedWeight = pickedRaid ? weights[pickedRaid.id] || 0 : 0;
  const pickedPercentage = totalWeight > 0 ? ((pickedWeight / totalWeight) * 100).toFixed(1) : '0';

  // Recency penalty only applies to the 2 most recent picks; on the 3rd roll/revote, it drops to 0!
  const isRecentHistoryRaid = (raidId: string): boolean => {
    return history.slice(0, 2).some((h) => h.raid_id.toLowerCase() === raidId.toLowerCase());
  };

  // Action: Reroll Target
  const handleReroll = async () => {
    if (isPicking || isLoading || !currentPlayer.is_host) return;

    if (onReroll) {
      await onReroll();
      return;
    }

    setIsPicking(true);
    try {
      const result = pickRaid(raids, voteInputs, vetoInputs, historyInputs);
      const chosenId = result.pickedRaid?.id || '__EMPTY_POOL__';

      await supabase
        .from('rooms')
        .update({ picked_raid_id: chosenId })
        .eq('id', room.id);

      if (result.pickedRaid) {
        const pickedAt = getIsoTimestamp();
        await supabase.from('history').insert({
          room_id: room.id,
          raid_id: result.pickedRaid.id,
          picked_at: pickedAt,
        });

        setHistory((prev) => [{ raid_id: result.pickedRaid!.id, picked_at: pickedAt }, ...prev]);
      }

      if (onPickDetermined) {
        onPickDetermined(chosenId);
      }
    } catch (err) {
      console.error('Failed to reroll target:', err);
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <div>
      {/* Hero Selected Raid Card */}
      {isPoolEmpty ? (
        <div
          className="panel-card"
          style={{
            borderColor: 'var(--border-strong)',
            padding: '24px',
            marginBottom: '20px',
            backgroundColor: 'var(--bg-panel)',
          }}
        >
          <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '8px' }}>
            [CRITICAL // ALL DESTINATIONS VETOED]
          </div>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '8px', color: 'var(--text-main)' }}>
            NO VALID RAID DESTINATIONS REMAIN
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            All available raids were vetoed by fireteam members. Use the leader controls on the right to reset ballots and revote.
          </p>
        </div>
      ) : pickedRaid ? (
        <div
          className="panel-card"
          style={{
            borderColor: 'var(--gold)',
            padding: '24px 28px',
            marginBottom: '20px',
            backgroundColor: 'var(--bg-panel)',
          }}
        >
          <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '8px' }}>
            [DEPLOYMENT TARGET]
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '2.5rem',
                  fontWeight: 800,
                  color: 'var(--gold)',
                  lineHeight: 1.1,
                  letterSpacing: '0.03em',
                  marginBottom: '8px',
                }}
              >
                {pickedRaid.name}
              </h1>
              <p
                style={{
                  color: 'var(--text-main)',
                  fontSize: '1.05rem',
                  maxWidth: '680px',
                  lineHeight: '1.4',
                }}
              >
                {pickedRaid.tagline}
              </p>
            </div>

            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              <div
                className="tag tag-gold"
                style={{
                  fontSize: '0.95rem',
                  padding: '8px 16px',
                  fontFamily: 'var(--font-condensed)',
                  letterSpacing: '0.06em',
                }}
              >
                {pickedPercentage}% CHANCE
              </div>
              {isRecentHistoryRaid(pickedRaid.id) && (
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-subtle)',
                    fontFamily: 'var(--font-condensed)',
                  }}
                >
                  [RECENT RUN]
                </div>
              )}
              {currentPlayer.is_host && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={handleReroll}
                  disabled={isPicking || isLoading}
                  style={{ marginTop: '4px' }}
                >
                  {isPicking ? 'ROLLING...' : 'REROLL'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="panel-card"
          style={{
            borderColor: 'var(--gold-border)',
            padding: '24px',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '6px' }}>
            [SELECTING TARGET...]
          </div>
          <h2 style={{ fontSize: '1.3rem' }}>
            {isPicking ? 'SELECTING RAID...' : 'SYNCHRONIZING TARGET...'}
          </h2>
        </div>
      )}

      {/* Main Grid: Standings + Leader Controls */}
      <div className="landing-grid" style={{ gridTemplateColumns: '1.4fr 0.6fr', gap: '20px' }}>
        {/* Left Column: Destination Standings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="panel-card">
            <div className="panel-header">
              <div>
                <div className="label-caps">[VOTE TOTALS]</div>
                <h2>DESTINATION STANDINGS</h2>
              </div>
              <span className="label-caps" style={{ color: 'var(--gold)' }}>
                {votes.length} VOTES RECORDED
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Header row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 0.8fr 1fr',
                  padding: '6px 12px',
                  fontSize: '0.72rem',
                  color: 'var(--text-subtle)',
                  fontFamily: 'var(--font-condensed)',
                  letterSpacing: '0.08em',
                  borderBottom: 'var(--border-width) solid var(--border)',
                }}
              >
                <span>DESTINATION</span>
                <span style={{ textAlign: 'center' }}>VOTES</span>
                <span style={{ textAlign: 'right' }}>CHANCE</span>
              </div>

              {/* Eligible Raids */}
              {eligibleRaids.map((r) => {
                const raidVotes = votes.filter((v) => v.raid_id.toLowerCase() === r.id.toLowerCase());
                const voteTotal = raidVotes.reduce((sum, v) => sum + (v.score || 0), 0);
                const weight = weights[r.id] || 0;
                const pct = totalWeight > 0 ? ((weight / totalWeight) * 100).toFixed(1) : '0';
                const isSelected = pickedRaid?.id === r.id;

                return (
                  <div
                    key={r.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 0.8fr 1fr',
                      alignItems: 'center',
                      padding: '10px 12px',
                      backgroundColor: isSelected ? 'var(--bg-panel)' : 'var(--bg-input)',
                      border: 'var(--border-width) solid',
                      borderColor: isSelected ? 'var(--gold)' : 'var(--border)',
                      borderRadius: 'var(--radius)',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--font-condensed)',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: isSelected ? 'var(--gold)' : 'var(--text-main)',
                        }}
                      >
                        {r.name}
                      </div>
                    </div>

                    <div
                      style={{
                        textAlign: 'center',
                        fontFamily: 'var(--font-condensed)',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {voteTotal}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span
                        className="tag"
                        style={{
                          borderColor: isSelected ? 'var(--gold)' : 'var(--border)',
                          color: isSelected ? 'var(--gold)' : 'var(--text-muted)',
                          fontSize: '0.8rem',
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Vetoed Raids */}
              {vetoedRaidIds.map((vId) => {
                const raid = raids.find((r) => r.id.toLowerCase() === vId.toLowerCase());
                const vetoCast = vetoes.find((v) => v.raid_id.toLowerCase() === vId.toLowerCase());
                const player = players.find((p) => p.id === vetoCast?.player_id);

                return (
                  <div
                    key={vId}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 0.8fr 1fr',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-deep)',
                      border: 'var(--border-width) solid var(--border)',
                      borderRadius: 'var(--radius)',
                      opacity: 0.65,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--font-condensed)',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          color: 'var(--text-subtle)',
                        }}
                      >
                        {raid?.name || vId}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-subtle)' }}>
                        Vetoed by {player?.name || 'Guardian'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>
                      —
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className="tag" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-subtle)' }}>
                        [VETOED]
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {currentPlayer.is_host ? (
            <div className="panel-card" style={{ borderColor: 'var(--border-strong)' }}>
              <div className="label-caps" style={{ marginBottom: '8px' }}>FIRETEAM LEADER CONTROLS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={handleReroll}
                  disabled={isPicking || isLoading}
                >
                  {isPicking ? 'ROLLING TARGET...' : 'REROLL TARGET'}
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%' }}
                  onClick={onResetToVoting}
                  disabled={isLoading || isPicking}
                >
                  REVOTE (RESET BALLOTS)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ width: '100%' }}
                  onClick={onReturnToLobby}
                  disabled={isLoading || isPicking}
                >
                  RETURN TO LOBBY
                </button>
                {onDisbandRoom && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      width: '100%',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-muted)',
                      marginTop: '4px',
                    }}
                    onClick={onDisbandRoom}
                    disabled={isLoading || isPicking}
                    title="Immediately kill and delete this room from the database"
                  >
                    KILL ROOM (DISBAND)
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="panel-card" style={{ borderColor: 'var(--border)' }}>
              <div className="label-caps" style={{ marginBottom: '8px' }}>FIRETEAM STATUS</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.4' }}>
                Target assigned. Awaiting orders from Fireteam Leader.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RevealedView;
