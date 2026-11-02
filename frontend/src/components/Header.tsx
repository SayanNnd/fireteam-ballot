import React, { useState } from 'react';

interface HeaderProps {
  roomCode?: string;
  onLeave?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ roomCode, onLeave }) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'code' | 'link'>('idle');

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopyStatus('code');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('code');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handleShareLink = async () => {
    if (!roomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    try {
      if (navigator.share && /mobile/i.test(navigator.userAgent)) {
        await navigator.share({
          title: 'Fireteam Ballot',
          text: `Join Destiny 2 Fireteam Ballot for room [${roomCode}]`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopyStatus('link');
        setTimeout(() => setCopyStatus('idle'), 2000);
      }
    } catch {
      await navigator.clipboard.writeText(url);
      setCopyStatus('link');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  return (
    <header className="top-nav">
      {/* Brand area with Destiny Emblem */}
      <div className="brand-badge">
        <div className="brand-emblem" aria-hidden="true">
          <img
            src="/raid-complex-svgrepo-com.svg"
            alt="Fireteam Ballot Logo"
            width="28"
            height="28"
            style={{ filter: 'invert(72%) sepia(60%) saturate(500%) hue-rotate(5deg) brightness(100%)' }}
          />
        </div>
        <div>
          <h1 className="brand-title">FIRETEAM BALLOT</h1>
        </div>
      </div>

      {/* Right controls: Room Code, Copy, Share, Leave */}
      {roomCode && (
        <div className="header-actions">
          <div className="header-room-code-group">
            <span className="label-caps header-room-label">ROOM CODE</span>
            <div className="header-room-code-box">{roomCode}</div>
          </div>

          <button
            type="button"
            className="btn btn-sm header-action-btn"
            onClick={handleCopyCode}
            title="Copy 4-letter room code to clipboard"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{copyStatus === 'code' ? 'COPIED!' : 'COPY'}</span>
          </button>

          <button
            type="button"
            className="btn btn-sm header-action-btn"
            onClick={handleShareLink}
            title="Share direct room invitation link"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>{copyStatus === 'link' ? 'LINK COPIED!' : 'SHARE LINK'}</span>
          </button>

          {onLeave && (
            <button
              type="button"
              className="btn btn-sm header-leave-btn"
              onClick={onLeave}
              title="Leave current fireteam session"
            >
              LEAVE ROOM
            </button>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
