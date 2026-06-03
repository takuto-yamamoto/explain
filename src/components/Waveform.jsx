import React from 'react'

export function Waveform({ active, color = '#3B82F6', bars = 5 }) {
  return (
    <div className="flex items-end gap-[3px]" style={{ height: 20 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="rounded-full wave-bar"
          style={{
            width: 3,
            height: 20,
            background: color,
            opacity: active ? 1 : 0.2,
            animationDelay: `${i * 0.1}s`,
            animationPlayState: active ? 'running' : 'paused',
            transform: active ? undefined : 'scaleY(0.3)',
            transition: 'opacity 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}
