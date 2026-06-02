import React, { useEffect, useRef } from 'react';

export default function TextDisplay({ sentences, currentIndex, appState }) {
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentIndex]);

  if (!sentences || sentences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <div style={{ color: 'var(--text-secondary)' }} className="text-sm font-mono tracking-widest uppercase">
          No content loaded
        </div>
        <div style={{ color: 'var(--border-bright)', fontSize: '11px' }}>
          PDFをアップロードして学習を開始してください
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1 leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {sentences.map((sentence, idx) => {
        const isActive = idx === currentIndex;
        const isRead = sentence.status === 'read';
        const isExplaining = isActive && appState === 'explaining';

        let className = 'inline ';
        if (isActive && appState === 'reading') {
          className += 'highlight-reading';
        } else if (isExplaining) {
          className += 'highlight-reading';
        } else if (isRead) {
          className += 'highlight-explained';
        }

        const textColor = isActive
          ? 'var(--text-primary)'
          : isRead
          ? 'rgba(232,244,255,0.45)'
          : 'rgba(232,244,255,0.75)';

        return (
          <span
            key={idx}
            ref={isActive ? activeRef : null}
            className={className}
            style={{
              color: textColor,
              fontSize: '15px',
              lineHeight: '1.9',
              transition: 'color 0.3s ease',
              position: 'relative',
            }}
          >
            {isExplaining && (
              <span
                style={{
                  position: 'absolute',
                  top: '-18px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '10px',
                  color: '#a78bfa',
                  fontFamily: "'Syne', sans-serif",
                  letterSpacing: '0.1em',
                  whiteSpace: 'nowrap',
                  background: 'rgba(10,8,30,0.9)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  border: '1px solid rgba(167,139,250,0.3)',
                  pointerEvents: 'none',
                }}
              >
                AI解説中
              </span>
            )}
            {sentence.text}{' '}
          </span>
        );
      })}
    </div>
  );
}
