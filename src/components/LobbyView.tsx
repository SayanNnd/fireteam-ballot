import React, { useState } from 'react';
import type { Room, Player } from '../types';
import raids from '../data/raids';

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
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      {/* Top Session Metadata Bar */}
      <div className="lobby-header-bar">
        <div className="room-code-tag">
          <div className="label-caps">ROOM CODE:</div>
          <div className="room-code-box">{room.code}</div>
          <button
            className="btn btn-sm"
            onClick={handleCopyCode}
            title="Copy 4-letter room code"
          >
            {copied ? 'COPIED!' : 'COPY CODE'}
          </button>
          <button
            className="btn btn-sm"
            onClick={handleCopyLink}
            title="Copy direct join link for fireteam"
          >
            SHARE LINK
          </button>
        </div>

        <div className="fireteam-counter">
          FIRETEAM ROSTER: <span>{players.length}</span> / {maxPlayers}
        </div>
      </div>

      {/* Fireteam Roster Grid */}
      <div>
        <div className="label-caps" style={{ marginBottom: '10px' }}>
          ACTIVE FIRETEAM SLOTS
        </div>

        <div className="roster-grid">
          {players.map((player, index) => {
            const isSelf = player.id === currentPlayer.id;
            const isOnline = onlinePlayerIds.has(player.id) || isSelf;

            return (
              <div
                key={player.id}
                className={`player-slot ${isSelf ? 'is-self' : ''}`}
                style={{ opacity: isOnline ? 1 : 0.65 }}
              >
                <div className="player-info">
                  <div
                    className="player-indicator"
                    style={{
                      backgroundColor: isOnline ? 'var(--gold)' : 'var(--text-subtle)',
                      opacity: isOnline ? 1 : 0.35,
                    }}
                  />
                  <div>
                    <div className="label-caps" style={{ fontSize: '0.68rem', marginBottom: '2px' }}>
                      SLOT 0{index + 1}
                    </div>
                    <div className="player-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{player.name}</span>
                      {!isOnline && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontStyle: 'italic' }}>
                          (Disconnected)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="player-tags" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {!isOnline && <span className="tag" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-subtle)' }}>[OFFLINE]</span>}
                  {player.is_host && <span className="tag tag-gold">[HOST]</span>}
                  {isSelf && <span className="tag">[YOU]</span>}
                  {isHost && !player.is_host && (
                    <button
                      className="btn btn-sm"
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.7rem',
                        borderColor: 'var(--border-strong)',
                        color: 'var(--text-muted)',
                      }}
                      onClick={() => onKickPlayer(player.id)}
                      title={`Remove ${player.name} from fireteam`}
                    >
                      KICK
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty Roster Slots */}
          {Array.from({ length: emptySlotsCount }).map((_, index) => (
            <div key={`empty-${index}`} className="player-slot-empty">
              + OPEN SLOT 0{players.length + index + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Raid Pool Preview */}
      <div className="pool-preview">
        <div className="label-caps" style={{ color: 'var(--text-muted)' }}>
          CANDIDATE RAID POOL ({raids.length} DESTINATIONS)
        </div>
        <div className="pool-list">
          {raids.map((r) => (
            <span key={r.id} className="pool-pill">
              {r.name}
            </span>
          ))}
        </div>
      </div>

      {/* Host Controls & Action Dock */}
      <div className="action-dock">
        <div>
          <div className="label-caps">STATUS</div>
          <div style={{ color: 'var(--text-main)', fontFamily: 'var(--font-condensed)', fontSize: '1rem' }}>
            {isHost
              ? 'Fireteam assembled. Ready to initiate private voting phase.'
              : 'Awaiting Fireteam Leader to initiate voting...'}
          </div>
        </div>

        {isHost ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            {onDisbandRoom && (
              <button
                type="button"
                className="btn btn-sm"
                style={{ borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }}
                onClick={onDisbandRoom}
                disabled={isLoading}
                title="Kill room and delete from database"
              >
                KILL ROOM
              </button>
            )}
            <button
              className="btn btn-primary btn-large"
              onClick={onStartVoting}
              disabled={isLoading || players.length === 0}
            >
              {isLoading ? 'STARTING...' : 'START VOTING'}
            </button>
          </div>
        ) : (
          <div className="tag tag-ready" style={{ padding: '8px 14px', fontSize: '0.85rem' }}>
            STANDBY FOR LAUNCH
          </div>
        )}
      </div>
    </div>
  );
};
