import React from 'react';
import { BookOpen, Sparkles } from 'lucide-react';

export default function TermsList({ terms }) {
  if (terms.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <BookOpen size={20} style={{ color: 'var(--border-bright)' }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
          解説済み用語がここに表示されます
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {terms.map((item, i) => (
        <div
          key={i}
          className="fade-in-up"
          style={{
            background: 'rgba(56,182,255,0.05)',
            border: '1px solid rgba(56,182,255,0.15)',
            borderRadius: '8px',
            padding: '10px 12px',
            animationDelay: `${i * 0.05}s`,
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={11} style={{ color: 'var(--azure)', flexShrink: 0 }} />
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 600,
                fontSize: '12px',
                color: 'var(--azure)',
                letterSpacing: '0.02em',
              }}
            >
              {item.term}
            </span>
          </div>
          <p
            style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              lineHeight: '1.6',
              margin: 0,
            }}
          >
            {item.explanation}
          </p>
        </div>
      ))}
    </div>
  );
}
