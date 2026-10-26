import React, { useCallback, useEffect, useRef, useState } from 'react';
import { verifyBungieName } from '../lib/bungie';

interface LandingViewProps {
  onCreateRoom: (hostName: string) => Promise<void>;
  onJoinRoom: (code: string, playerName: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

type BungieNameStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'unavailable';

const isBungieName = (name: string) => /^.{1,20}#\d{4}$/u.test(name.trim());

function useBungieNameValidation(name: string) {
  const [status, setStatus] = useState<BungieNameStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentNameRef = useRef(name.trim());
  const requestRef = useRef<{ name: string; promise: Promise<void> } | null>(null);
  currentNameRef.current = name.trim();

  const verify = useCallback((candidate: string) => {
    const cleanName = candidate.trim();
    if (!isBungieName(cleanName)) return Promise.resolve();
    if (requestRef.current?.name === cleanName) return requestRef.current.promise;

    setStatus('checking');
    setErrorMessage(null);
    let promise: Promise<void>;
    promise = verifyBungieName(cleanName)
      .then((result) => {
        if (currentNameRef.current === cleanName) {
          setStatus(result.valid ? 'valid' : 'invalid');
        }
      })
      .catch((error: unknown) => {
        if (currentNameRef.current === cleanName) {
          setStatus('unavailable');
          setErrorMessage(error instanceof Error ? error.message.slice(0, 100) : 'Unknown request error.');
        }
      })
      .finally(() => {
        if (requestRef.current?.promise === promise) requestRef.current = null;
      });
    requestRef.current = { name: cleanName, promise };
    return promise;
  }, []);

  useEffect(() => {
    const candidate = name.trim();
    if (!isBungieName(candidate)) {
      setStatus('idle');
      setErrorMessage(null);
      requestRef.current = null;
      return;
    }

    setStatus('checking');
    const timer = window.setTimeout(() => {
      void verify(candidate);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [name, verify]);

  const verifyBeforeSubmit = useCallback(() => verify(name), [name, verify]);
  return { status, errorMessage, verifyBeforeSubmit };
}

const BungieNameStatusText: React.FC<{
  name: string;
  status: BungieNameStatus;
  errorMessage: string | null;
}> = ({ name, status, errorMessage }) => {
  let message: string | null = null;
  let color = 'var(--text-muted)';

  if (isBungieName(name)) {
    if (status === 'checking') message = 'Checking Bungie Name…';
    if (status === 'valid') {
      message = 'Bungie Name found.';
      color = 'var(--gold)';
    }
    if (status === 'invalid') {
      message = 'No matching Bungie Name found.';
      color = '#fda4af';
    }
    if (status === 'unavailable') {
      message = errorMessage
        ? `Bungie lookup failed: ${errorMessage}`
        : 'Bungie lookup is unavailable right now.';
    }
  }

  if (!message) return null;

  return (
    <p aria-live="polite" style={{ color, fontSize: '0.78rem', lineHeight: 1.45, marginTop: '-8px', marginBottom: '16px' }}>
      {message}
    </p>
  );
};

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
  const hostNameValidation = useBungieNameValidation(hostName);
  const joinNameValidation = useBungieNameValidation(joinName);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostName.trim()) return;
    await hostNameValidation.verifyBeforeSubmit();
    onCreateRoom(hostName.trim());
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinName.trim() || roomCode.trim().length !== 4) return;
    await joinNameValidation.verifyBeforeSubmit();
    onJoinRoom(roomCode.trim().toUpperCase(), joinName.trim());
  };

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        backgroundImage: 'linear-gradient(to bottom, rgba(6,10,16,0.5) 0%, rgba(6,10,16,0.78) 55%, rgba(6,10,16,0.97) 100%), url(/fireteam.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'scroll',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px 48px',
        gap: '48px',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: '680px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(3rem, 7vw, 5rem)',
          fontWeight: 900,
          letterSpacing: '0.06em',
          color: 'var(--text-main)',
          lineHeight: 1.05,
          marginBottom: '16px',
          textShadow: '0 4px 32px rgba(0,0,0,0.8)',
        }}>
          FIRETEAM BALLOT
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', lineHeight: 1.6, maxWidth: '560px', margin: '0 auto' }}>
          Rank your raid preferences, cast your veto, and let the highest vote determine tonight's destination.
        </p>
      </div>

      {error && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--gold)',
          padding: '12px 20px',
          color: 'var(--gold)',
          fontFamily: 'var(--font-condensed)',
          fontSize: '0.95rem',
          letterSpacing: '0.05em',
          borderRadius: 'var(--radius)',
          maxWidth: '640px',
          width: '100%',
        }}>
          [ERROR] {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        width: '100%',
        maxWidth: '980px',
      }}>
        <section className="panel-card" style={{ borderColor: 'var(--border-strong)', padding: '44px 48px' }}>
          <div className="panel-header" style={{ marginBottom: '28px' }}>
            <div>
              <div className="label-caps" style={{ marginBottom: '6px', fontSize: '0.82rem' }}>[DIRECT LINK]</div>
              <h2 style={{ fontSize: '1.9rem' }}>JOIN FIRETEAM</h2>
            </div>
            <span className="label-caps gold-label">SLOT 1-6</span>
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
                style={{ fontSize: '1.5rem', letterSpacing: '0.22em', textAlign: 'center' }}
              />
            </div>
            <div className="input-group">
              <label className="label-caps" htmlFor="join-name">GUARDIAN NAME / BUNGIE NAME</label>
              <input
                id="join-name"
                className="input-field"
                type="text"
                maxLength={25}
                placeholder="e.g. Saint-14#1234"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <BungieNameStatusText
              name={joinName}
              status={joinNameValidation.status}
              errorMessage={joinNameValidation.errorMessage}
            />
            <button
              type="submit"
              className="btn btn-primary btn-large"
              style={{ width: '100%', marginTop: '12px', fontSize: '1rem', padding: '14px' }}
              disabled={isLoading || !joinName.trim() || roomCode.trim().length !== 4}
            >
              {isLoading ? 'ESTABLISHING LINK...' : 'JOIN FIRETEAM'}
            </button>
          </form>
        </section>

        <section className="panel-card" style={{ padding: '44px 48px' }}>
          <div className="panel-header" style={{ marginBottom: '28px' }}>
            <div>
              <div className="label-caps" style={{ marginBottom: '6px', fontSize: '0.82rem' }}>[LEADER]</div>
              <h2 style={{ fontSize: '1.9rem' }}>HOST NEW SESSION</h2>
            </div>
          </div>
          <p style={{ fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '28px', lineHeight: '1.7' }}>
            Generate a secure 4-letter frequency code and invite up to 5 other Guardians to vote on tonight's raid destination.
          </p>
          <form onSubmit={handleCreateSubmit}>
            <div className="input-group">
              <label className="label-caps" htmlFor="host-name">FIRETEAM LEADER / BUNGIE NAME</label>
              <input
                id="host-name"
                className="input-field"
                type="text"
                maxLength={25}
                placeholder="e.g. Zavala#1234"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                disabled={isLoading}
                required
              />
            </div>
            <BungieNameStatusText
              name={hostName}
              status={hostNameValidation.status}
              errorMessage={hostNameValidation.errorMessage}
            />
            <button
              type="submit"
              className="btn btn-large"
              style={{ width: '100%', marginTop: '12px', fontSize: '1rem', padding: '14px' }}
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

