import React, { useState } from 'react';
import type { Room, Player } from '../types';

interface LobbyViewProps {
  room: Room;
  players: Player[];
  currentPlayer: Player;
  onlinePlayerIds: Set<string>;
  onStartVoting: () => Promise<void>;
  onKickPlayer: (playerId: string) => Promise<void>;
  onDisbandRoom?: () => Promise<void>;
  isLoading: boolean;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  players,
  currentPlayer,
  onlinePlayerIds,
  onStartVoting,
  onKickPlayer,
  onDisbandRoom,
  isLoading,
}) => {
  const [copied, setCopied] = useState(false);
  const isHost = currentPlayer.is_host;
  const maxPlayers = 6;
  const emptySlotsCount = Math.max(0, maxPlayers - players.length);

  const handleCopyCode = async () => {
    try { await navigator.clipboard.writeText(room.code); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
      await navigator.clipboard.writeText(url);
    } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 56px)',
        backgroundImage: 'linear-gradient(to bottom, rgba(6,10,16,0.55) 0%, rgba(6,10,16,0.82) 45%, rgba(6,10,16,0.96) 100%), url(/fireteam.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'scroll',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '56px 48px 80px', width: '100%', flex: 1 }}>

        {/* ── Top bar: room code + roster count ── */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(8,12,20,0.82)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          padding: '20px 32px',
          marginBottom: '40px',
          gap: '16px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <div className="label-caps" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>ROOM CODE</div>
            <div style={{
              background: 'var(--bg-deep)',
              border: '2px solid var(--gold)',
              borderRadius: 'var(--radius)',
              padding: '6px 24px',
              fontFamily: 'var(--font-display)',
              fontSize: '2.4rem',
              fontWeight: 900,
              letterSpacing: '0.24em',
              color: 'var(--gold)',
              lineHeight: 1,
            }}>{room.code}</div>
            <button className="btn btn-sm" onClick={handleCopyCode} style={{ fontSize: '0.9rem', padding: '10px 20px' }}>
              {copied ? 'COPIED!' : 'COPY CODE'}
            </button>
            <button className="btn btn-sm" onClick={handleCopyLink} style={{ fontSize: '0.9rem', padding: '10px 20px' }}>
              SHARE LINK
            </button>
          </div>
          <div style={{ fontFamily: 'var(--font-condensed)', fontSize: '1.25rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            FIRETEAM ROSTER:&nbsp;
            <span style={{ color: 'var(--text-main)', fontSize: '1.6rem', fontWeight: 700 }}>{players.length}</span>
            <span style={{ color: 'var(--text-subtle)' }}> / {maxPlayers}</span>
          </div>
        </div>

        {/* ── Fireteam Roster Grid ── */}
        <div style={{ marginBottom: '36px' }}>
          <div className="label-caps" style={{ fontSize: '0.82rem', color: 'var(--gold)', marginBottom: '6px', letterSpacing: '0.18em' }}>
            FIRETEAM SLOTS
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '20px', letterSpacing: '0.04em' }}>
            FIRETEAM ROSTER
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
            {players.map((player, index) => {
              const isSelf = player.id === currentPlayer.id;
              const isOnline = onlinePlayerIds.has(player.id) || isSelf;
              return (
                <div
                  key={player.id}
                  style={{
                    background: isSelf ? 'rgba(229,169,59,0.08)' : 'rgba(8,12,20,0.75)',
                    border: isSelf ? '1px solid var(--gold)' : '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius)',
                    padding: '18px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backdropFilter: 'blur(6px)',
                    opacity: isOnline ? 1 : 0.6,
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      backgroundColor: isOnline ? 'var(--gold)' : 'var(--text-subtle)',
                      flexShrink: 0,
                    }} />
                    <div>
                      <div className="label-caps" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                        SLOT 0{index + 1}
                      </div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        {player.name}
                        {!isOnline && <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-body)', fontWeight: 400, marginLeft: '8px', fontStyle: 'italic' }}>(Disconnected)</span>}
                      </div>
                      {player.is_host && <div style={{ fontSize: '0.8rem', color: 'var(--gold)', fontFamily: 'var(--font-condensed)', marginTop: '2px', letterSpacing: '0.08em' }}>Fireteam Leader</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {player.is_host && <span className="tag tag-gold" style={{ fontSize: '0.82rem', padding: '4px 12px' }}>HOST</span>}
                    {isSelf && <span className="tag" style={{ fontSize: '0.82rem', padding: '4px 12px' }}>YOU</span>}
                    {isHost && !player.is_host && (
                      <button className="btn btn-sm" style={{ padding: '4px 14px', fontSize: '0.78rem', borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }} onClick={() => onKickPlayer(player.id)}>
                        KICK
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {Array.from({ length: emptySlotsCount }).map((_, index) => (
              <div
                key={`empty-${index}`}
                style={{
                  background: 'rgba(4,7,14,0.78)',
                  border: '1px solid rgba(120,130,150,0.45)',
                  borderRadius: 'var(--radius)',
                  padding: '18px 24px',
                  color: 'rgba(160,170,190,0.7)',
                  fontFamily: 'var(--font-condensed)',
                  fontSize: '0.95rem',
                  letterSpacing: '0.12em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span style={{ fontSize: '1.1rem', opacity: 0.5 }}>+</span>
                OPEN SLOT 0{players.length + index + 1}
              </div>
            ))}
          </div>
        </div>

        {/* ── Disband button (host only) ── */}
        {isHost && onDisbandRoom && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 32px 0' }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)', padding: '12px 36px', fontSize: '0.9rem', letterSpacing: '0.1em' }}
              onClick={onDisbandRoom}
              disabled={isLoading}
            >
              DISBAND ROOM
            </button>
          </div>
        )}

        {/* ── Action Dock ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          background: 'rgba(8,12,20,0.75)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '24px 36px',
          backdropFilter: 'blur(6px)',
        }}>
          <div>
            <div className="label-caps" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '6px' }}>STATUS</div>
            <div style={{ fontFamily: 'var(--font-condensed)', fontSize: '1.15rem', color: 'var(--text-main)', letterSpacing: '0.04em' }}>
              {isHost
                ? 'Ready to start voting.'
                : 'Waiting for the host to start voting.'}
            </div>
          </div>
          {isHost ? (
            <button className="btn btn-primary btn-large" onClick={onStartVoting} disabled={isLoading || players.length === 0}
              style={{ fontSize: '1.05rem', padding: '16px 40px', letterSpacing: '0.1em' }}>
              {isLoading ? 'STARTING...' : 'START VOTING'}
            </button>
          ) : (
            <div className="tag tag-ready" style={{ padding: '12px 24px', fontSize: '1rem' }}>WAITING FOR HOST</div>
          )}
        </div>

      </div>
    </div>
  );
};
