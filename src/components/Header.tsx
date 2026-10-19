import React from 'react';

interface HeaderProps {
  roomCode?: string;
  onLeave?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ roomCode, onLeave }) => {
  return (
    <header className="top-nav">
      <div className="brand-badge">
        <span className="brand-mark" />
        <div>
          <h1 className="brand-title">RAID PICKER</h1>
          <div className="brand-protocol">PROTOCOL // FIRETEAM POOL SELECTION</div>
        </div>
      </div>

      {roomCode && onLeave && (
        <button className="btn btn-sm" onClick={onLeave} title="Abandon fireteam session">
          LEAVE ROOM
        </button>
      )}
    </header>
  );
};
