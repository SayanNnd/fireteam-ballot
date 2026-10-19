import React, { useState, useEffect } from 'react';
import type { Room, Player } from '../types';
import raids from '../data/raids';
import { fetchLiveFeaturedRaidIds, getFeaturedRaidIds } from '../lib/bungie';

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

const SCORE_LABELS: Record<number, string> = {
  1: 'SKIP',
  2: 'LOW',
  3: 'MID',
  4: 'HIGH',
  5: 'TOP',
};

export const VotingView: React.FC<VotingViewProps> = ({
  room,
  players,
  currentPlayer,
  onlinePlayerIds,
  onLockIn,
  onForceAdvance,
  onReturnToLobby,
  onKickPlayer,
  onDisbandRoom,
  isLoading,
}) => {
  const isLocked = currentPlayer.has_locked;
  const draftStorageKey = `fireteam_ballot_draft_${room.id}_${currentPlayer.id}`;
  const userPreferencesKey = 'fireteam_ballot_user_preferences';

  // Local draft scores: initialize from room draft, saved user preferences, or default 3 (MID)
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

  // Save drafts locally so page refresh preserves progress, and persist user preferences
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

  // Clean up draft storage once locked in
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
  const offlineCount = players.filter((p) => !onlinePlayerIds.has(p.id) && p.id !== currentPlayer.id).length;

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
    <div>
      {/* Top Protocol Status Bar */}
      <div className="lobby-header-bar" style={{ marginBottom: '20px' }}>
        <div>
          <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '2px' }}>
            [FIRETEAM VOTING]
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 700 }}>
            FIRETEAM [{room.code}] // VOTING ACTIVE
          </div>
        </div>

        <div className="fireteam-counter">
          BALLOTS LOCKED: <span>{lockedCount}</span> / {totalPlayers}
          {offlineCount > 0 && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginLeft: '6px' }}>
              • {offlineCount} DISCONNECTED
            </span>
          )}
        </div>
      </div>

      <div className="landing-grid" style={{ gridTemplateColumns: '1.35fr 0.65fr', gap: '20px' }}>
        {/* Left Column: Ballot Candidate Raids */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="label-caps" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>BALLOT CANDIDATES ({raids.length} DESTINATIONS)</span>
            <span>PREFERENCE SCALE: 1 (LOW) &rarr; 5 (TOP)</span>
          </div>

          {raids.map((raid) => {
            const isVetoed = vetoRaidId === raid.id;
            const currentScore = scores[raid.id] ?? 3;
            const isFeatured = featuredRaidIds.has(raid.id);

            return (
              <div
                key={raid.id}
                className="panel-card"
                style={{
                  padding: '14px 16px',
                  borderColor: isVetoed ? 'var(--gold)' : 'var(--border)',
                  backgroundColor: isVetoed ? 'var(--bg-panel)' : 'var(--bg-card)',
                  opacity: isLocked ? 0.9 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.15rem', color: isVetoed ? 'var(--gold)' : 'var(--text-main)', margin: 0 }}>
                        {raid.name}
                      </h3>
                      {isFeatured && (
                        <span
                          className="tag"
                          style={{
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            borderColor: 'var(--gold)',
                            color: 'var(--gold)',
                            letterSpacing: '0.04em',
                          }}
                        >
                          FEATURED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {raid.tagline}
                    </div>
                  </div>

                  {/* Veto Button */}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.72rem',
                      borderColor: isVetoed ? 'var(--gold)' : 'var(--border-strong)',
                      backgroundColor: isVetoed ? 'var(--gold-dim)' : 'transparent',
                      color: isVetoed ? 'var(--gold)' : 'var(--text-muted)',
                    }}
                    onClick={() => handleToggleVeto(raid.id)}
                    disabled={isLocked || isLoading}
                    title={isVetoed ? 'Cancel Veto' : 'Veto this raid (removes it from the pool)'}
                  >
                    {isVetoed ? '[VETO ACTIVE]' : 'VETO (1 MAX)'}
                  </button>
                </div>

                {/* Score Selector (1-5) */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span className="label-caps" style={{ fontSize: '0.68rem', color: isVetoed ? 'var(--gold)' : 'var(--text-muted)' }}>
                    {isVetoed ? '[EXCLUDED BY VETO]' : `PRIORITY: ${SCORE_LABELS[currentScore]} (${currentScore}/5)`}
                  </span>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map((val) => {
                      const isSelected = currentScore === val && !isVetoed;
                      return (
                        <button
                          key={val}
                          type="button"
                          className="btn btn-sm"
                          style={{
                            padding: '4px 9px',
                            minWidth: '32px',
                            fontSize: '0.85rem',
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            borderColor: isSelected ? 'var(--gold)' : 'var(--border)',
                            backgroundColor: isSelected ? 'var(--gold)' : 'var(--bg-input)',
                            color: isSelected ? 'var(--bg-deep)' : 'var(--text-main)',
                            opacity: isVetoed ? 0.35 : 1,
                          }}
                          onClick={() => handleScoreChange(raid.id, val)}
                          disabled={isLocked || isLoading || isVetoed}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Fireteam Roster & Lock-In Action */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="panel-card" style={{ borderColor: isLocked ? 'var(--gold-border)' : 'var(--border)' }}>
            <div className="panel-header">
              <div>
                <div className="label-caps">[LOCK-IN PROTOCOL]</div>
                <h2 style={{ fontSize: '1.2rem' }}>YOUR BALLOT</h2>
              </div>
              <span className="tag" style={{ color: isLocked ? 'var(--gold)' : 'var(--text-muted)' }}>
                {isLocked ? '[LOCKED]' : '[EDITING]'}
              </span>
            </div>

            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: '1.4' }}>
              {isLocked
                ? 'Your ballot and veto are sealed. Votes remain confidential until all Guardians lock in.'
                : 'Rank each raid from 1 to 5. You may also assign 1 veto to ban a raid from selection.'}
            </p>

            {vetoRaidId && !isLocked && (
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--gold)',
                  marginBottom: '12px',
                  fontFamily: 'var(--font-condensed)',
                  letterSpacing: '0.05em',
                }}
              >
                [VETO ASSIGNED]: {raids.find((r) => r.id === vetoRaidId)?.name}
              </div>
            )}

            {!isLocked ? (
              <button
                type="button"
                className="btn btn-primary btn-large"
                style={{ width: '100%' }}
                onClick={handleConfirmLockIn}
                disabled={isLoading}
              >
                {isLoading ? 'SEALING BALLOT...' : 'LOCK IN BALLOT'}
              </button>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '12px',
                  backgroundColor: 'var(--bg-input)',
                  border: 'var(--border-width) solid var(--gold-border)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-condensed)',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  letterSpacing: '0.08em',
                  color: 'var(--gold)',
                }}
              >
                BALLOT SEALED
              </div>
            )}
          </div>

          {/* Live Roster Lock Status */}
          <div className="panel-card">
            <div className="panel-header">
              <div className="label-caps">FIRETEAM STATUS</div>
              <span className="label-caps" style={{ color: 'var(--gold)' }}>
                {lockedCount}/{totalPlayers} READY
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {players.map((p) => {
                const isSelf = p.id === currentPlayer.id;
                const isOnline = onlinePlayerIds.has(p.id) || isSelf;

                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      backgroundColor: isSelf ? 'var(--bg-panel)' : 'var(--bg-input)',
                      border: 'var(--border-width) solid',
                      borderColor: isSelf ? 'var(--gold-border)' : 'var(--border)',
                      borderRadius: 'var(--radius)',
                      opacity: isOnline ? 1 : 0.75,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          backgroundColor: p.has_locked ? 'var(--gold)' : (isOnline ? 'var(--text-subtle)' : 'var(--text-subtle)'),
                          opacity: isOnline ? 1 : 0.35,
                        }}
                      />
                      <span style={{ fontFamily: 'var(--font-condensed)', fontWeight: 600 }}>
                        {p.name} {isSelf && '(YOU)'}
                      </span>
                      {!isOnline && (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                          (Disconnected)
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        className="tag"
                        style={{
                          borderColor: p.has_locked ? 'var(--gold)' : (isOnline ? 'var(--border)' : 'var(--border-strong)'),
                          color: p.has_locked ? 'var(--gold)' : (isOnline ? 'var(--text-muted)' : 'var(--text-subtle)'),
                        }}
                      >
                        {p.has_locked ? '[LOCKED]' : (isOnline ? '[DELIBERATING]' : '[OFFLINE]')}
                      </span>

                      {currentPlayer.is_host && !isSelf && !isOnline && onKickPlayer && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            padding: '2px 7px',
                            fontSize: '0.68rem',
                            borderColor: 'var(--border-strong)',
                            color: 'var(--text-muted)',
                          }}
                          onClick={() => onKickPlayer(p.id)}
                          disabled={isLoading}
                          title={`Remove disconnected player ${p.name}`}
                        >
                          KICK
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Host Controls */}
          {currentPlayer.is_host && (
            <div className="panel-card" style={{ borderColor: 'var(--border-strong)' }}>
              <div className="label-caps" style={{ marginBottom: '8px' }}>FIRETEAM LEADER OVERRIDES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ width: '100%', borderColor: 'var(--gold)' }}
                  onClick={onForceAdvance}
                  disabled={isLoading || lockedCount === 0}
                  title="Advance to reveal even if some players haven't locked in"
                >
                  FORCE ADVANCE ({lockedCount} LOCKED)
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ width: '100%' }}
                  onClick={onReturnToLobby}
                  disabled={isLoading}
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
                    disabled={isLoading}
                    title="Immediately kill and delete this room from the database"
                  >
                    KILL ROOM (DISBAND)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
