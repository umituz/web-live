import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';

export interface LiveRoomBadgeProps {
  status?: 'live' | 'offline' | 'connecting' | 'idle';
  viewerCount?: number;
  startedAt?: number | string | Date;
  variant?: 'pill' | 'card' | 'compact';
  showDuration?: boolean;
  className?: string;
  style?: CSSProperties;
}

function formatDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function LiveRoomBadge({
  status = 'live',
  viewerCount,
  startedAt,
  variant = 'pill',
  showDuration = true,
  className,
  style,
}: LiveRoomBadgeProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt || status !== 'live') return;
    const startMs = typeof startedAt === 'number'
      ? startedAt
      : new Date(startedAt).getTime();

    const update = () => setElapsed(Date.now() - startMs);
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt, status]);

  const dotColor = status === 'live'
    ? '#ef4444'
    : status === 'connecting'
      ? '#f59e0b'
      : '#64748b';

  const statusLabel = status === 'live'
    ? 'LIVE'
    : status === 'connecting'
      ? 'CONNECTING'
      : status === 'offline'
        ? 'OFFLINE'
        : 'IDLE';

  if (variant === 'compact') {
    return (
      <span
        className={className ?? 'ulive-badge-compact'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: dotColor,
          fontFamily: 'inherit',
          ...style,
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            boxShadow: status === 'live' ? '0 0 0 2px rgba(239, 68, 68, 0.25)' : 'none',
          }}
        />
        {statusLabel}
      </span>
    );
  }

  return (
    <div
      className={className ?? 'ulive-badge'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 10px',
        borderRadius: variant === 'card' ? '8px' : '9999px',
        background: status === 'live' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(100, 116, 139, 0.1)',
        border: `1px solid ${status === 'live' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
        color: status === 'live' ? '#dc2626' : '#475569',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: 'inherit',
        ...style,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: status === 'live' ? '0 0 0 3px rgba(239, 68, 68, 0.25)' : 'none',
        }}
      />
      <span>{statusLabel}</span>

      {status === 'live' && showDuration && startedAt && (
        <span style={{ opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
          {formatDuration(elapsed)}
        </span>
      )}

      {viewerCount !== undefined && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            borderLeft: '1px solid currentColor',
            paddingLeft: '8px',
            opacity: 0.9,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {viewerCount}
        </span>
      )}
    </div>
  );
}
