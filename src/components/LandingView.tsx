import React, { useState } from 'react';

interface LandingViewProps {
  onCreateRoom: (hostName: string) => Promise<void>;
  onJoinRoom: (code: string, playerName: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onCreateRoom,
  onJoinRoom,
  isLoading,
  error,
}) => {
  const [hostName, setHostName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [roomCode, setRoomCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('room');
    return codeParam ? codeParam.toUpperCase().slice(0, 4) : '';
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostName.trim()) return;
    onCreateRoom(hostName.trim());
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim() || roomCode.trim().length !== 4) return;
    onJoinRoom(roomCode.trim().toUpperCase(), joinName.trim());
  };

  return (
    <div>
      {error && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: 'var(--border-width) solid var(--gold)',
          padding: '12px 16px',
          marginBottom: '20px',
          color: 'var(--gold)',
          fontFamily: 'var(--font-condensed)',
          fontSize: '0.95rem',
          letterSpacing: '0.05em'
        }}>
          [ERROR] {error}
        </div>
      )}

      <div className="landing-grid">
        {/* Primary Focal Point: Join Fireteam */}
        <section className="panel-card" style={{ borderColor: 'var(--border-strong)' }}>
          <div className="panel-header">
            <div>
              <div className="label-caps">[DIRECT LINK]</div>
              <h2>JOIN FIRETEAM</h2>
            </div>
            <span className="label-caps" style={{ color: 'var(--gold)' }}>SLOT 1-6</span>
          </div>

          <form onSubmit={handleJoinSubmit}>
            <div className="input-group">
              <label className="label-caps" htmlFor="join-code">FOUR-LETTER ROOM CODE</label>
              <input
                id="join-code"
                className="input-field input-code"
                type="text"
                maxLength={4}
                placeholder="WRAK"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                autoComplete="off"
                disabled={isLoading}
                required
              />
            </div>

            <div className="input-group">
              <label className="label-caps" htmlFor="join-name">GUARDIAN IDENTIFIER (NAME)</label>
              <input
                id="join-name"
                className="input-field"
                type="text"
                maxLength={20}
                placeholder="e.g. Saint-14"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-large"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={isLoading || !joinName.trim() || roomCode.trim().length !== 4}
            >
              {isLoading ? 'ESTABLISHING LINK...' : 'JOIN FIRETEAM'}
            </button>
          </form>
        </section>

        {/* Secondary Asymmetric Column: Establish New Fireteam */}
        <section className="panel-card">
          <div className="panel-header">
            <div>
              <div className="label-caps">[LEADER]</div>
              <h2>HOST NEW SESSION</h2>
            </div>
          </div>

          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
            Generate a secure 4-letter frequency code and invite up to 5 other Guardians to vote on tonight's raid.
          </p>

          <form onSubmit={handleCreateSubmit}>
            <div className="input-group">
              <label className="label-caps" htmlFor="host-name">FIRETEAM LEADER NAME</label>
              <input
                id="host-name"
                className="input-field"
                type="text"
                maxLength={20}
                placeholder="e.g. Zavala"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>

            <button
              type="submit"
              className="btn"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={isLoading || !hostName.trim()}
            >
              {isLoading ? 'GENERATING ROOM...' : 'CREATE ROOM'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};
