import React from 'react';
import { Cpu, Zap } from 'lucide-react';

const STATE_LABELS = {
  idle: { label: 'STANDBY', color: 'var(--text-secondary)' },
  reading: { label: 'READING', color: '#34d399' },
  explaining: { label: 'AI EXPLAINING', color: '#a78bfa' },
};

export default function StatusBar({ appState, progress, total }) {
  const { label, color } = STATE_LABELS[appState] ?? STATE_LABELS.idle;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div className="flex items-center justify-between gap-4">
      {/* Status pill */}
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            boxShadow: appState !== 'idle' ? `0 0 8px ${color}` : 'none',
            transition: 'all 0.3s ease',
          }}
        />
        <span
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 700,
            fontSize: '11px',
            letterSpacing: '0.12em',
            color,
            transition: 'color 0.3s ease',
          }}
        >
          {label}
        </span>
      </div>

      {/* Model badge */}
      <div className="flex items-center gap-1.5" style={{ opacity: 0.5 }}>
        <Cpu size={10} style={{ color: 'var(--azure)' }} />
        <span style={{ fontFamily: "'JetBrains Mono'", fontSize: '10px', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>
          gemini-2.0-flash-lite
        </span>
      </div>

      {/* Progress */}
      {total > 0 && (
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: '11px', color: 'var(--text-secondary)' }}>
            {progress}/{total}
          </span>
          <div style={{ width: 80, height: 2, background: 'rgba(56,182,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div className="progress-bar" style={{ width: `${pct}%`, height: '100%' }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono'", fontSize: '11px', color: 'var(--azure)' }}>
            {pct}%
          </span>
        </div>
      )}
    </div>
  );
}
