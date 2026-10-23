import React from 'react';
import raids from '../data/raids';
import { supabase } from '../lib/supabase';
import { getRecentRaidIds } from '../lib/pick';

interface RecentClearsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  history: { raid_id: string; picked_at?: string }[];
  onHistoryChange: (updatedHistory: { raid_id: string; picked_at: string }[]) => void;
  panelRef?: React.RefObject<HTMLDivElement>;
}

export const RecentClearsModal: React.FC<RecentClearsModalProps> = ({
  isOpen,
  onClose,
  roomId,
  history,
  onHistoryChange,
  panelRef,
}) => {
  if (!isOpen) return null;

  const recentIds = new Set(getRecentRaidIds(history, 2));

  const handleToggleRaid = async (raidId: string) => {
    const isRecent = recentIds.has(raidId.toLowerCase());
    try {
      if (isRecent) {
        await supabase
          .from('history')
          .delete()
          .eq('room_id', roomId)
          .ilike('raid_id', raidId);

        const updated = history.filter((h) => h.raid_id.toLowerCase() !== raidId.toLowerCase());
        onHistoryChange(updated as { raid_id: string; picked_at: string }[]);
      } else {
        const pickedAt = new Date().toISOString();
        await supabase.from('history').insert({
          room_id: roomId,
          raid_id: raidId,
          picked_at: pickedAt,
        });

        const updated = [{ raid_id: raidId, picked_at: pickedAt }, ...history];
        onHistoryChange(updated);
      }
    } catch (err) {
      console.error('Failed to update recent clear:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await supabase.from('history').delete().eq('room_id', roomId);
      onHistoryChange([]);
    } catch (err) {
      console.error('Failed to clear all history:', err);
    }
  };

  return (
    <div className="recent-clears-float-panel" ref={panelRef}>
      {/* Header */}
      <div className="recent-clears-float-header">
        <div>
          <div className="label-caps gold-label" style={{ marginBottom: '2px' }}>RECENT CLEARS</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0, lineHeight: 1.3 }}>
            Last 2 raids cleared get a −3 vote penalty
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={handleClearAll}
            style={{ borderColor: 'var(--gold-border)', color: 'var(--gold)', whiteSpace: 'nowrap' }}
          >
            RESET ALL
          </button>
          <button
            type="button"
            className="recent-clears-close-btn"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Raid list */}
      <div className="recent-clears-float-list">
        {raids.map((r) => {
          const isRecent = recentIds.has(r.id.toLowerCase());
          return (
            <div
              key={r.id}
              className={`recent-clears-row ${isRecent ? 'is-recent-clear' : ''}`}
            >
              <div>
                <div className="recent-clears-row-name">{r.name}</div>
                <div className="recent-clears-row-loc">{r.location || 'Destiny 2 Destination'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isRecent && (
                  <span className="tag tag-gold" style={{ fontSize: '0.68rem' }}>
                    −3
                  </span>
                )}
                <button
                  type="button"
                  className={`btn btn-sm ${isRecent ? 'btn-primary' : ''}`}
                  onClick={() => handleToggleRaid(r.id)}
                  style={{ minWidth: '80px', textAlign: 'center' }}
                >
                  {isRecent ? 'REMOVE' : '+ ADD'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecentClearsModal;
