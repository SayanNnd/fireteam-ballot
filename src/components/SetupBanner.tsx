import React from 'react';

export const SetupBanner: React.FC = () => {
  return (
    <div className="setup-alert">
      <div className="label-caps" style={{ color: 'var(--gold)', marginBottom: '4px' }}>
        [SYS] CONFIGURATION REQUIRED
      </div>
      <h3 className="setup-title">SUPABASE CREDENTIALS MISSING</h3>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
        To enable real-time synchronization between fireteam members:
      </p>
      <ol style={{ paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.6' }}>
        <li>Run the queries from <span className="setup-code">schema.sql</span> in your Supabase SQL Editor.</li>
        <li>Copy your Supabase Project URL and Anon API Key from Settings &gt; API.</li>
        <li>Add them to <span className="setup-code">.env</span> as <span className="setup-code">VITE_SUPABASE_URL</span> and <span className="setup-code">VITE_SUPABASE_ANON_KEY</span>.</li>
        <li>Restart the Vite dev server.</li>
      </ol>
    </div>
  );
};
