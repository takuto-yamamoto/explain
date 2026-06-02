import React from 'react';

export default function WaveformVisualizer({ active, mode }) {
  const bars = 20;
  const color = mode === 'explaining' ? '#a78bfa' : '#38b6ff';
  
  return (
    <div className="flex items-center gap-[3px] h-8">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="wave-bar"
          style={{
            background: color,
            boxShadow: active ? `0 0 6px ${color}` : 'none',
            animationDelay: active ? `${(i * 0.08) % 0.8}s` : '0s',
            animationPlayState: active ? 'running' : 'paused',
            transform: active ? undefined : 'scaleY(0.2)',
            opacity: active ? 1 : 0.3,
            height: '100%',
            transition: 'opacity 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}
