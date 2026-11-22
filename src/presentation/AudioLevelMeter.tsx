import type { CSSProperties } from 'react';

export interface AudioLevelMeterProps {
  level: number;
  isSpeaking?: boolean;
  bars?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  speakingColor?: string;
  className?: string;
  style?: CSSProperties;
}

export function AudioLevelMeter({
  level,
  isSpeaking = false,
  bars = 4,
  size = 'md',
  color = '#94a3b8',
  speakingColor = '#10b981',
  className,
  style,
}: AudioLevelMeterProps) {
  const clampedLevel = Math.max(0, Math.min(100, level));
  const activeColor = isSpeaking || clampedLevel > 15 ? speakingColor : color;

  const barWidth = size === 'sm' ? 2 : size === 'lg' ? 4 : 3;
  const maxHeight = size === 'sm' ? 12 : size === 'lg' ? 20 : 16;
  const gap = size === 'sm' ? 2 : 3;

  const barCount = Math.max(2, Math.min(8, bars));

  return (
    <div
      className={className ?? 'ulive-audio-meter'}
      role="progressbar"
      aria-label="Audio level"
      aria-valuenow={clampedLevel}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap: `${gap}px`,
        height: `${maxHeight}px`,
        ...style,
      }}
    >
      {Array.from({ length: barCount }, (_, index) => {
        const threshold = ((index + 1) / barCount) * 100;
        const isActive = clampedLevel >= threshold * 0.7;
        const heightFactor = isActive
          ? Math.max(0.2, (clampedLevel - threshold * 0.5) / 50)
          : 0.15;
        const barHeight = Math.max(2, Math.round(maxHeight * Math.min(1, heightFactor)));

        return (
          <span
            key={index}
            style={{
              width: `${barWidth}px`,
              height: `${barHeight}px`,
              borderRadius: '9999px',
              backgroundColor: isActive ? activeColor : 'rgba(148, 163, 184, 0.3)',
              transition: 'height 80ms ease, background-color 150ms ease',
            }}
          />
        );
      })}
    </div>
  );
}
