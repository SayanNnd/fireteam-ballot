import React, { useEffect, useState } from 'react';
import type { Room, Player } from '../types';
import { supabase } from '../lib/supabase';
import raids from '../data/raids';

interface RevealedViewProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onlinePlayerIds: Set<string>;
  onResetToVoting: () => Promise<void>;
  onReturnToLobby: () => Promise<void>;
  onDisbandRoom?: () => Promise<void>;
  isLoading: boolean;
}

export const RevealedView: React.FC<RevealedViewProps> = ({
  room,
  players,
  currentPlayer,
  onlinePlayerIds,
  onResetToVoting,
  onReturnToLobby,
  onDisbandRoom,
  isLoading,
}) => {
  const [vetoes, setVetoes] = useState<{ player_id: string; raid_id: string }[]>([]);
  const [votesCount, setVotesCount] = useState<number>(0);

  // Now that all players have locked in, votes and vetoes can be securely queried!
  useEffect(() => {
    async function loadResults() {
      try {
        const [vetoesRes, votesRes] = await Promise.all([
          supabase.from('vetoes').select('player_id, raid_id').eq('room_id', room.id),
          supabase.from('votes').select('id', { count: 'exact' }).eq('room_id', room.id),
        ]);

        if (vetoesRes.data) setVetoes(vetoesRes.data);
        if (votesRes.count !== null) setVotesCount(votesRes.count);
      } catch (err) {
        console.error('Error loading revealed results:', err);
      }
    }

    loadResults();
  }, [room.id]);

  const vetoedRaidIds = new Set(vetoes.map((v) => v.raid_id));

  return (
    <div>
      <div className="lobby-header-bar" style={{ marginBottom: '24px' }}>
        <div>
          <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '2px' }}>
            [STAGE: BALLOTS SEALED // REVEAL COMPLETE]
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 800 }}>
            FIRETEAM [{room.code}] // ALL GUARDIANS LOCKED IN
          </div>
        </div>

        <div className="tag tag-gold" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
          PHASE 2 COMPLETE
        </div>
      </div>

      <div className="landing-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
        {/* Left: Summary of Vetoes and Candidates */}
        <div className="panel-card" style={{ borderColor: 'var(--gold)' }}>
          <div className="panel-header">
            <div>
              <div className="label-caps">[BALLOT SUMMARY]</div>
              <h2>FIRETEAM VOTING OUTCOME</h2>
            </div>
            <span className="label-caps" style={{ color: 'var(--gold)' }}>
              {votesCount} TOTAL VOTES
            </span>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
            All {players.length} Guardians submitted and locked their ballots.
            {vetoes.length > 0
              ? ` ${vetoes.length} raid destination(s) were vetoed and removed from selection.`
              : ' No vetoes were cast.'}
          </p>

          <div className="label-caps" style={{ marginBottom: '8px' }}>
            VETO STATUS ({vetoes.length} VETOED)
          </div>

          {vetoes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
              {vetoes.map((v, i) => {
                const raid = raids.find((r) => r.id === v.raid_id);
                const player = players.find((p) => p.id === v.player_id);
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-input)',
                      border: 'var(--border-width) solid var(--gold-border)',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                      [VETOED]: {raid?.name || v.raid_id}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      by {player?.name || 'Guardian'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              No vetoes used. All {raids.length} destinations remain eligible.
            </div>
          )}

          <div className="label-caps" style={{ marginBottom: '8px' }}>
            ELIGIBLE POOL FOR WEIGHTED PICK ({raids.length - vetoedRaidIds.size} RAIDS)
          </div>
          <div className="pool-list">
            {raids
              .filter((r) => !vetoedRaidIds.has(r.id))
              .map((r) => (
                <span key={r.id} className="pool-pill" style={{ color: 'var(--text-main)', borderColor: 'var(--border-strong)' }}>
                  {r.name}
                </span>
              ))}
          </div>
        </div>

        {/* Right: Roster & Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="panel-card">
            <div className="panel-header">
              <div className="label-caps">LOCKED ROSTER</div>
              <span className="label-caps" style={{ color: 'var(--gold)' }}>
                {players.length}/{players.length} LOCKED
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
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-input)',
                      border: 'var(--border-width) solid var(--border)',
                      borderRadius: 'var(--radius)',
                      opacity: isOnline ? 1 : 0.75,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                      {!isOnline && (
                        <span className="tag" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-subtle)' }}>
                          [OFFLINE]
                        </span>
                      )}
                      <span className="tag tag-gold">[LOCKED IN]</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Leader Controls */}
          {currentPlayer.is_host && (
            <div className="panel-card" style={{ borderColor: 'var(--border-strong)' }}>
              <div className="label-caps" style={{ marginBottom: '8px' }}>FIRETEAM LEADER CONTROLS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={onResetToVoting}
                  disabled={isLoading}
                >
                  REVOTE (TEST PHASE 2 AGAIN)
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
