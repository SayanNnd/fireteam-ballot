import React, { useEffect, useState, useRef } from 'react';
import type { Room, Player } from '../types';
import { supabase } from '../lib/supabase';
import raids from '../data/raids';
import { pickRaid, calculateRaidWeights, type VoteInput, type VetoInput, type HistoryInput } from '../lib/pick';
import { RevealAnimation } from './RevealAnimation';
import { RecentClearsModal } from './RecentClearsModal';

interface RevealedViewProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onlinePlayerIds: Set<string>;
  onResetToVoting: () => Promise<void>;
  onReturnToLobby: () => Promise<void>;
  onDisbandRoom?: () => Promise<void>;
  onPickDetermined?: (pickedRaidId: string) => void;
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
  isLoading,
}) => {
  const [vetoes, setVetoes] = useState<{ player_id: string; raid_id: string }[]>([]);
  const [votes, setVotes] = useState<{ player_id: string; raid_id: string; score: number }[]>([]);
  const [history, setHistory] = useState<{ raid_id: string; picked_at: string }[]>([]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [showRecentClearsModal, setShowRecentClearsModal] = useState(false);
  const hasExecutedPick = useRef(false);
  const recentClearsPanelRef = useRef<HTMLDivElement>(null);
  const recentClearsButtonRef = useRef<HTMLButtonElement>(null);

  // Close Recent Clears panel when clicking outside (but not on any .recent-clears-trigger)
  useEffect(() => {
    if (!showRecentClearsModal) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;
      const outsidePanel = recentClearsPanelRef.current && !recentClearsPanelRef.current.contains(target);
      const onTrigger = !!target.closest('.recent-clears-trigger');
      if (outsidePanel && !onTrigger) {
        setShowRecentClearsModal(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showRecentClearsModal]);

  // Animation state: track if reveal animation should be shown
  const [showAnimation, setShowAnimation] = useState(() => {
    // Only show auto-animation once per session per pick
    const animSeenKey = `fireteam_ballot_anim_seen_${room.id}_${room.picked_raid_id || 'initial'}`;
    return !sessionStorage.getItem(animSeenKey);
  });

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

  // 2. Authoritative Pick Selection: Host executes pick
  useEffect(() => {
    if (!isDataLoaded || room.picked_raid_id || hasExecutedPick.current) return;

    const voteInputs: VoteInput[] = votes.map((v) => ({ raid_id: v.raid_id, score: v.score }));
    const vetoInputs: VetoInput[] = vetoes.map((v) => ({ raid_id: v.raid_id }));
    const historyInputs: HistoryInput[] = history.map((h) => ({ raid_id: h.raid_id, picked_at: h.picked_at }));

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

  // 3. Compute vote scores for display
  const voteInputs: VoteInput[] = votes.map((v) => ({ raid_id: v.raid_id, score: v.score }));
  const vetoInputs: VetoInput[] = vetoes.map((v) => ({ raid_id: v.raid_id }));
  const historyInputs: HistoryInput[] = history.map((h) => ({ raid_id: h.raid_id, picked_at: h.picked_at }));

  const { eligibleRaids, weights, vetoedRaidIds } = calculateRaidWeights(
    raids,
    voteInputs,
    vetoInputs,
    historyInputs
  );

  // Compute raw votes for each raid from votes array
  const getRawVotesForRaid = (raidId: string): number => {
    return votes
      .filter((v) => v.raid_id.toLowerCase() === raidId.toLowerCase())
      .reduce((sum, v) => sum + v.score, 0);
  };

  // Map picked raid from ID
  const pickedRaidId = room.picked_raid_id;
  const isPoolEmpty = pickedRaidId === '__EMPTY_POOL__' || (isDataLoaded && eligibleRaids.length === 0);
  const pickedRaid = raids.find((r) => r.id === pickedRaidId) || null;

  const pickedRawVotes = pickedRaid ? getRawVotesForRaid(pickedRaid.id) : 0;

  // Sort eligible destinations: winner always first, then by raw votes descending
  const sortedEligibleRaids = [...eligibleRaids].sort((a, b) => {
    const aIsWinner = pickedRaid?.id === a.id;
    const bIsWinner = pickedRaid?.id === b.id;
    if (aIsWinner) return -1;
    if (bIsWinner) return 1;
    const rawA = votes.filter(v => v.raid_id.toLowerCase() === a.id.toLowerCase()).reduce((s, v) => s + v.score, 0);
    const rawB = votes.filter(v => v.raid_id.toLowerCase() === b.id.toLowerCase()).reduce((s, v) => s + v.score, 0);
    if (rawB !== rawA) return rawB - rawA;
    return a.name.localeCompare(b.name);
  });

  const isRecentHistoryRaid = (raidId: string): boolean => {
    return history.slice(0, 2).some((h) => h.raid_id.toLowerCase() === raidId.toLowerCase());
  };

  const handleDismissAnimation = () => {
    setShowAnimation(false);
    if (pickedRaidId) {
      sessionStorage.setItem(`fireteam_ballot_anim_seen_${room.id}_${pickedRaidId}`, 'true');
    }
  };


  // If reveal animation is active and destination is confirmed, render animation overlay
  if (showAnimation && pickedRaid && !isPoolEmpty) {
    return (
      <RevealAnimation
        eligibleRaids={eligibleRaids}
        pickedRaid={pickedRaid}
        pickedVotes={pickedRawVotes}
        onComplete={handleDismissAnimation}
      />
    );
  }

  return (
    <div className="revealed-layout-container">
      {/* Hero Selected Raid Card */}
      {isPoolEmpty ? (
        <div className="panel-card panel-hero-card" style={{ borderColor: 'var(--border-strong)' }}>
          <div className="label-caps gold-label" style={{ marginBottom: '8px' }}>
            ALL DESTINATIONS VETOED
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
          className="panel-card panel-hero-card"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(6, 10, 16, 0.97) 0%, rgba(6, 10, 16, 0.82) 40%, rgba(6, 10, 16, 0.55) 70%, rgba(6, 10, 16, 0.75) 100%), url(${pickedRaid.image || '/raids/placeholder.svg'})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '340px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div className="hero-top-row">
            <div>
              <div className="label-caps gold-label" style={{ marginBottom: '6px' }}>
                SELECTED DESTINATION
              </div>
              <h1 className="hero-raid-name">{pickedRaid.name}</h1>
              <p className="hero-raid-desc">
                {pickedRaid.location && (
                  <span style={{ color: 'var(--meta-cyan)', fontWeight: 600 }}>
                    {pickedRaid.location}
                  </span>
                )}
                {pickedRaid.location && pickedRaid.tagline && <span style={{ color: 'var(--text-muted)' }}> · </span>}
                {pickedRaid.tagline}
              </p>
            </div>

            <div className="hero-stats-column">
              <div className="hero-odds-badge">
                {pickedRawVotes} {pickedRawVotes === 1 ? 'VOTE' : 'VOTES'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="panel-card" style={{ textAlign: 'center', padding: '36px' }}>
          <div className="label-caps gold-label" style={{ marginBottom: '8px' }}>
            CALCULATING RESULTS...
          </div>
          <h2 style={{ fontSize: '1.4rem' }}>
            {isPicking ? 'TALLYING VOTES...' : 'SYNCHRONIZING TARGET...'}
          </h2>
        </div>
      )}

      {/* Main Grid: Standings + Leader Controls */}
      <div className="landing-grid" style={{ gridTemplateColumns: '1.45fr 0.55fr', gap: '20px' }}>
        {/* Left Column: Destination Standings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="panel-card standings-panel-card">
            <div className="panel-header">
              <div>
                <div className="label-caps gold-label">STANDINGS</div>
                <h2>FINAL RESULTS</h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  ref={recentClearsButtonRef}
                  type="button"
                  className="btn btn-sm recent-clears-trigger"
                  onClick={() => setShowRecentClearsModal((prev) => !prev)}
                  title="Manage recent cleared destinations"
                >
                  RECENT CLEARS
                </button>
                <span className="label-caps gold-label">
                  {votes.length} VOTES RECORDED
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Standings Table Header */}
              <div className="standings-table-header">
                <span>DESTINATION</span>
                <span style={{ textAlign: 'center' }}>VOTES</span>
                <span style={{ textAlign: 'right' }}>RESULT</span>
              </div>

              {/* Eligible Raids */}
              {sortedEligibleRaids.map((r, index) => {
                const rawVoteTotal = getRawVotesForRaid(r.id);
                const isSelected = pickedRaid?.id === r.id;
                const isRecent = isRecentHistoryRaid(r.id);

                return (
                  <div
                    key={r.id}
                    className={`standings-row ${isSelected ? 'is-selected-standing' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div>
                        <div className="standing-name">
                          {r.name}
                          {isSelected && <span className="standing-won-tag">TARGET</span>}
                          {isRecent && (
                            <span
                              className="standing-recent-penalty-tag tag-clickable recent-clears-trigger"
                              onClick={() => setShowRecentClearsModal((prev) => !prev)}
                              title="Recent clear deduction. Click to manage recent clears."
                              style={{ cursor: 'pointer' }}
                            >
                              -3 RECENT
                            </span>
                          )}
                        </div>
                        <div className="standing-location">
                          {r.location || 'DESTINATION'}
                        </div>
                      </div>
                    </div>

                    <div className="standing-votes">
                      {rawVoteTotal}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className={`tag ${isSelected ? 'tag-gold' : ''}`}>
                        {isSelected ? 'WINNER' : `#${index + 1}`}
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
                  <div key={vId} className="standings-row standing-vetoed-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div>
                        <div className="standing-name" style={{ color: 'var(--text-subtle)' }}>
                          {raid?.name || vId}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                          Vetoed by {player?.name || 'Guardian'}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'center', color: 'var(--text-subtle)' }}>—</div>

                    <div style={{ textAlign: 'right' }}>
                      <span className="tag tag-vetoed">
                        VETOED
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Leader Controls & Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {currentPlayer.is_host ? (
            <div className="panel-card" style={{ borderColor: 'var(--border-strong)' }}>
              <div className="label-caps gold-label" style={{ marginBottom: '12px' }}>
                LEADER CONTROLS
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
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
                      marginTop: '6px',
                    }}
                    onClick={onDisbandRoom}
                    disabled={isLoading || isPicking}
                    title="Disband room and terminate fireteam session"
                  >
                    DISBAND ROOM
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="panel-card">
              <div className="label-caps gold-label" style={{ marginBottom: '8px' }}>
                STATUS
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: '1.4' }}>
                Destination selected. Awaiting host to revote or return to lobby.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Clears Hover Panel */}
      <RecentClearsModal
        isOpen={showRecentClearsModal}
        onClose={() => setShowRecentClearsModal(false)}
        roomId={room.id}
        history={history}
        onHistoryChange={(newH) => setHistory(newH)}
        panelRef={recentClearsPanelRef}
      />
    </div>
  );
};

export default RevealedView;
