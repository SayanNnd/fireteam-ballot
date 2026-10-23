import React, { useState, useEffect, useCallback, useRef } from 'react';

import type { Room, Player } from '../types';
import raids from '../data/raids';
import { fetchLiveFeaturedRaidIds, getFeaturedRaidIds } from '../lib/bungie';
import { supabase } from '../lib/supabase';
import { getRecentRaidIds } from '../lib/pick';
import { RecentClearsModal } from './RecentClearsModal';

interface VotingViewProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onlinePlayerIds: Set<string>;
  onLockIn: (scores: Record<string, number>, vetoRaidId: string | null) => Promise<void>;
  onForceAdvance?: () => Promise<void>;
  onReturnToLobby: () => Promise<void>;
  onKickPlayer?: (playerId: string) => Promise<void>;
  onDisbandRoom?: () => Promise<void>;
  isLoading: boolean;
}

// Destiny 2 Guardian class geometric emblem SVGs
const GuardianEmblem: React.FC<{ index: number; isHost?: boolean }> = ({ index, isHost }) => {
  const iconType = isHost ? 0 : index % 4;

  if (iconType === 0) {
    // Circle / Warlock style
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="8" stroke="var(--gold)" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.5" fill="var(--gold)" />
      </svg>
    );
  }
  if (iconType === 1) {
    // Triangle / Hunter style
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12,4 20,19 4,19" stroke="var(--text-muted)" strokeWidth="1.5" />
      </svg>
    );
  }
  if (iconType === 2) {
    // Diamond / Titan style
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12,3 21,12 12,21 3,12" stroke="var(--text-muted)" strokeWidth="1.5" />
      </svg>
    );
  }
  // Shield / Crest style
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3L20 7V13C20 17.5 16.5 21 12 22C7.5 21 4 17.5 4 13V7L12 3Z" stroke="var(--text-muted)" strokeWidth="1.5" />
    </svg>
  );
};

export const VotingView: React.FC<VotingViewProps> = ({
  room,
  players,
  currentPlayer,
  onlinePlayerIds,
  onLockIn,
  onForceAdvance,
  onReturnToLobby,
  onDisbandRoom,
  isLoading,
}) => {
  const isLocked = currentPlayer.has_locked;
  const draftStorageKey = `fireteam_ballot_draft_${room.id}_${currentPlayer.id}`;
  const userPreferencesKey = 'fireteam_ballot_user_preferences';

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showRecentClearsModal, setShowRecentClearsModal] = useState(false);
  const [history, setHistory] = useState<{ raid_id: string; picked_at: string }[]>([]);
  const recentClearsPanelRef = useRef<HTMLDivElement>(null);
  const recentClearsButtonRef = useRef<HTMLButtonElement>(null);

  // Close Recent Clears panel when clicking outside it (but not on any .recent-clears-trigger element)
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

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('history')
        .select('*')
        .eq('room_id', room.id)
        .order('picked_at', { ascending: false });
      if (data) {
        setHistory(data.filter((h) => !h.raid_id.startsWith('__')));
      }
    } catch (err) {
      console.error('Failed to load history in VotingView:', err);
    }
  }, [room.id]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const recentTwoRaidIds = new Set(getRecentRaidIds(history, 2));

  // Local draft scores: initialize from room draft, saved preferences, or default 3
  const [scores, setScores] = useState<Record<string, number>>(() => {
    try {
      const savedDraft = localStorage.getItem(draftStorageKey);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed.scores) return parsed.scores;
      }
    } catch {
      // ignore
    }

    try {
      const savedPrefs = localStorage.getItem(userPreferencesKey);
      if (savedPrefs) {
        const parsed = JSON.parse(savedPrefs);
        if (parsed && typeof parsed === 'object') {
          const initial: Record<string, number> = {};
          raids.forEach((r) => {
            initial[r.id] = parsed[r.id] !== undefined ? parsed[r.id] : 3;
          });
          return initial;
        }
      }
    } catch {
      // ignore
    }

    const initial: Record<string, number> = {};
    raids.forEach((r) => {
      initial[r.id] = 3;
    });
    return initial;
  });

  // Local draft veto (max 1 raid)
  const [vetoRaidId, setVetoRaidId] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.vetoRaidId || null;
      }
    } catch {
      // ignore
    }
    return null;
  });

  // Save drafts locally
  useEffect(() => {
    if (!isLocked) {
      try {
        localStorage.setItem(
          draftStorageKey,
          JSON.stringify({ scores, vetoRaidId })
        );
        localStorage.setItem(
          userPreferencesKey,
          JSON.stringify(scores)
        );
      } catch {
        // ignore
      }
    }
  }, [scores, vetoRaidId, isLocked, draftStorageKey, userPreferencesKey]);

  useEffect(() => {
    if (isLocked) {
      localStorage.removeItem(draftStorageKey);
    }
  }, [isLocked, draftStorageKey]);

  const handleScoreChange = (raidId: string, score: number) => {
    if (isLocked || isLoading) return;
    setScores((prev) => ({ ...prev, [raidId]: score }));
  };

  const handleToggleVeto = (raidId: string) => {
    if (isLocked || isLoading) return;
    setVetoRaidId((prev) => (prev === raidId ? null : raidId));
  };

  const handleConfirmLockIn = async () => {
    if (isLocked || isLoading) return;
    await onLockIn(scores, vetoRaidId);
  };

  const lockedCount = players.filter((p) => p.has_locked).length;
  const totalPlayers = players.length;
  const maxSlots = 6;
  const emptySlotsCount = Math.max(0, maxSlots - players.length);

  const [featuredRaidIds, setFeaturedRaidIds] = useState<Set<string>>(() => getFeaturedRaidIds());

  useEffect(() => {
    let isMounted = true;
    fetchLiveFeaturedRaidIds().then((liveIds) => {
      if (isMounted) {
        setFeaturedRaidIds(new Set(liveIds));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="voting-layout-container">
      {/* 3-Column Asymmetric Grid */}
      <div className="voting-grid">
        {/* ================= COLUMN 1: FIRETEAM ROSTER ================= */}
        <aside className="voting-col-roster">
          <div className="roster-col-header">
            <span className="label-caps gold-label">FIRETEAM SLOTS</span>
            <div className="roster-title-row">
              <h2 className="roster-heading">FIRETEAM ROSTER</h2>
              <span className="roster-badge">{players.length} / {maxSlots}</span>
            </div>
          </div>

          <div className="roster-slots-list">
            {players.map((p, index) => {
              const isSelf = p.id === currentPlayer.id;
              const isHost = p.is_host;
              const isOnline = onlinePlayerIds.has(p.id) || isSelf;

              return (
                <div
                  key={p.id}
                  className={`roster-player-slot ${isSelf ? 'slot-self' : ''}`}
                >
                  <div className="slot-emblem-wrap">
                    <GuardianEmblem index={index} isHost={isHost} />
                  </div>

                  <div className="slot-info">
                    <div className="slot-name-row">
                      <span className="slot-player-name">{p.name}</span>
                    </div>
                    <div className="slot-subtitle">
                      {isHost ? 'Fireteam Leader' : p.has_locked ? 'Ballot Locked' : 'Deliberating'}
                      {!isOnline && ' (Offline)'}
                    </div>
                  </div>

                  <div className="slot-end-badge">
                    {isHost ? (
                      <span className="host-tag">HOST</span>
                    ) : (
                      <span className="dash-tag">{p.has_locked ? '✓' : '—'}</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Empty slots placeholders */}
            {Array.from({ length: emptySlotsCount }).map((_, i) => (
              <div key={`empty-${i}`} className="roster-player-slot slot-empty">
                <div className="slot-emblem-wrap empty-emblem">
                  <span className="empty-dot" />
                </div>
                <div className="slot-info">
                  <span className="empty-slot-label">EMPTY FIRETEAM SLOT</span>
                </div>
                <div className="slot-end-badge">
                  <span className="dash-tag">—</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ================= COLUMN 2: MAIN DESTINATION BALLOT ================= */}
        <section className="voting-col-main">
          {/* Main Ballot Header */}
          <div className="ballot-main-header">
            <div>
              <div className="label-caps gold-label">
                VOTING ACTIVE · ROOM {room.code}
              </div>
              <h1 className="ballot-main-title">RANK TONIGHT'S DESTINATIONS</h1>
              <p className="ballot-main-subtitle">
                Set a preference from 1 to 5 and optionally veto one destination.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <button
                ref={recentClearsButtonRef}
                type="button"
                className="btn btn-sm recent-clears-trigger"
                onClick={() => setShowRecentClearsModal((prev) => !prev)}
                title="Manage recent cleared raids (-3 penalty)"
              >
                RECENT CLEARS ({recentTwoRaidIds.size})
              </button>

              <div className="ballots-locked-counter">
                <span className="label-caps locked-label">BALLOTS LOCKED</span>
                <div className="locked-numbers">
                  <span className="locked-count">{lockedCount}</span>
                  <span className="locked-total"> / {totalPlayers}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Destinations List */}
          <div className="destinations-list">
            {raids.map((raid, index) => {
              const padIndex = String(index + 1).padStart(2, '0');
              const isVetoed = vetoRaidId === raid.id;
              const currentScore = scores[raid.id] ?? 3;
              const isLiveFeatured = featuredRaidIds.has(raid.id);
              const rawBadge = raid.badge === 'PINNACLE' ? 'FEATURED' : raid.badge;
              const badgeLabel = (isLiveFeatured ? 'FEATURED' : null) || rawBadge;
              const isRecent = recentTwoRaidIds.has(raid.id.toLowerCase());

              return (
                <div
                  key={raid.id}
                  className={`destination-row-card ${isVetoed ? 'is-vetoed' : ''}`}
                  style={{
                    backgroundImage: `linear-gradient(to right, rgba(10, 14, 20, 0.94) 0%, rgba(10, 14, 20, 0.84) 45%, rgba(10, 14, 20, 0.72) 80%, rgba(10, 14, 20, 0.90) 100%), url(${raid.image || '/raids/placeholder.svg'})`,
                  }}
                >
                  <div className="destination-card-content">
                    {/* Top Row: Title, Badges, and Score Selector */}
                    <div className="destination-card-top">
                      <div className="destination-title-area">
                        <span className="destination-num">{padIndex}</span>
                        <h3 className="destination-name">{raid.name}</h3>
                        {badgeLabel && (
                          <span className="destination-tag-badge">{badgeLabel}</span>
                        )}
                      </div>

                      {/* Score Selector (1-5) stays on the top right */}
                      <div className="destination-actions">
                        <div className="score-segmented-group" role="group" aria-label={`Score for ${raid.name}`}>
                          {[1, 2, 3, 4, 5].map((val) => {
                            const isSelected = currentScore === val && !isVetoed;
                            return (
                              <button
                                key={val}
                                type="button"
                                className={`score-segment-btn ${isSelected ? 'is-selected' : ''}`}
                                onClick={() => handleScoreChange(raid.id, val)}
                                disabled={isLocked || isLoading || isVetoed}
                                aria-pressed={isSelected}
                              >
                                {val}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Tagline, Details, Meta, AND Veto Button on the right */}
                    <div className="destination-card-bottom">
                      <div className="destination-desc-area">
                        <p className="destination-tagline">{raid.tagline}</p>
                        {raid.details && <p className="destination-details-text">{raid.details}</p>}
                        <div className="destination-meta">
                          {raid.location
                            ? <><span style={{ color: 'var(--meta-cyan)', fontWeight: 600 }}>{raid.location}</span>{' · '}</>  
                            : ''}
                          PRIORITY {currentScore}/5
                        </div>
                        {isRecent && (
                          <span
                            className="destination-recent-badge tag-clickable recent-clears-trigger"
                            onClick={() => setShowRecentClearsModal((prev) => !prev)}
                            title="Recent clear penalty applied (-3). Click to manage."
                            style={{ cursor: 'pointer', display: 'inline-block', marginTop: '8px' }}
                          >
                            RECENT (-3)
                          </span>
                        )}
                      </div>

                      {/* Veto Button wrapper pinned to bottom right */}
                      <div className="destination-veto-area">
                        <button
                          type="button"
                          className={`veto-btn ${isVetoed ? 'veto-btn-active' : ''}`}
                          onClick={() => handleToggleVeto(raid.id)}
                          disabled={isLocked || isLoading}
                          title={isVetoed ? 'Cancel Veto' : 'Veto this destination'}
                        >
                          {isVetoed ? 'VETO ACTIVE' : 'VETO'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================= COLUMN 3: PROTOCOL & LEADER CONTROLS ================= */}
        <aside className="voting-col-side">
          {/* Top Panel: Lock-in Protocol */}
          <div className="side-panel-card">
            <div className="label-caps gold-label">YOUR BALLOT</div>
            <p className="side-panel-desc" style={{ marginTop: '8px' }}>
              Rank each raid from 1 to 5. You may assign one veto to remove a raid from selection.
            </p>

            {vetoRaidId && !isLocked && (
              <div className="active-veto-banner">
                Veto: {raids.find((r) => r.id === vetoRaidId)?.name}
              </div>
            )}

            {!isLocked ? (
              <button
                type="button"
                className="btn-lock-in"
                onClick={handleConfirmLockIn}
                disabled={isLoading}
              >
                {isLoading ? 'LOCKING IN...' : 'LOCK IN BALLOT'}
              </button>
            ) : (
              <div className="ballot-sealed-badge">
                BALLOT SEALED
              </div>
            )}
          </div>

          {/* Middle Panel: Fireteam Status */}
          <div className="side-panel-card">
            <div className="side-panel-header-row">
              <span className="label-caps">FIRETEAM STATUS</span>
              <span className="label-caps gold-label">{lockedCount}/{totalPlayers} READY</span>
            </div>

            <div className="status-players-list">
              {players.map((p) => {
                const isOnline = onlinePlayerIds.has(p.id) || p.id === currentPlayer.id;

                return (
                  <div key={p.id} className="status-player-row">
                    <div className="status-player-left">
                      <span className={`status-square-indicator ${p.has_locked ? 'is-locked' : ''}`} />
                      <span className="status-player-name">{p.name}</span>
                    </div>
                    <span className={`status-pill ${p.has_locked ? 'pill-locked' : 'pill-deliberating'}`}>
                      {p.has_locked ? 'LOCKED' : isOnline ? 'DELIBERATING' : 'OFFLINE'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Panel: Fireteam Leader Controls */}
          {currentPlayer.is_host && (
            <div className="side-panel-card">
              <div className="label-caps gold-label" style={{ marginBottom: '12px' }}>
                LEADER CONTROLS
              </div>

              <div className="leader-actions-stack">
                <button
                  type="button"
                  className="btn leader-btn"
                  onClick={onForceAdvance}
                  disabled={isLoading || lockedCount === 0}
                  title="Advance to reveal even if some fireteam members haven't locked in"
                >
                  FORCE ADVANCE ({lockedCount} LOCKED)
                </button>

                <button
                  type="button"
                  className="btn leader-btn"
                  onClick={onReturnToLobby}
                  disabled={isLoading}
                >
                  RESET BALLOT
                </button>

                {onDisbandRoom && (
                  <button
                    type="button"
                    className="btn leader-btn leader-btn-danger"
                    onClick={onDisbandRoom}
                    disabled={isLoading}
                    title="Disband room and terminate fireteam session"
                  >
                    DISBAND ROOM
                  </button>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Floating Bottom-Right Help Button */}
      <button
        type="button"
        className="floating-help-btn"
        onClick={() => setShowHelpModal(true)}
        title="Protocol Guidelines & Instructions"
        aria-label="Ballot Protocol Help"
      >
        ?
      </button>

      {/* Protocol Help Modal */}
      {showHelpModal && (
        <div className="protocol-modal-backdrop" onClick={() => setShowHelpModal(false)}>
          <div className="protocol-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="panel-header">
              <div>
                <div className="label-caps gold-label">BALLOT PROTOCOL SPECIFICATION</div>
                <h2 style={{ fontSize: '1.3rem' }}>HOW FIRETEAM BALLOT WORKS</h2>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setShowHelpModal(false)}
              >
                ✕ CLOSE
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <div>
                <strong style={{ color: 'var(--gold)' }}>1. PREFERENCE SCALE (1 to 5):</strong>
                <p style={{ color: 'var(--text-muted)' }}>
                  Rate every raid destination from 1 (lowest preference) to 5 (top choice). Your individual ratings remain private until all fireteam members lock in.
                </p>
              </div>

              <div>
                <strong style={{ color: 'var(--gold)' }}>2. TACTICAL VETO (1 MAX):</strong>
                <p style={{ color: 'var(--text-muted)' }}>
                  Each Guardian may assign up to one veto. Vetoed raids are immediately stricken from the candidate pool and cannot be chosen under any circumstance.
                </p>
              </div>

              <div>
                <strong style={{ color: 'var(--gold)' }}>3. HIGHEST VOTE PICK:</strong>
                <p style={{ color: 'var(--text-muted)' }}>
                  Once ballots are locked, the algorithm tallies all fireteam preference points. The eligible destination with the highest total vote is selected. If multiple destinations tie for highest vote, the winner is chosen from among the tied leaders.
                </p>
              </div>
            </div>

            <div style={{ marginTop: '20px', textAlign: 'right' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowHelpModal(false)}
              >
                ACKNOWLEDGED
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Clears Modal */}
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

export default VotingView;
