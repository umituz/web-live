import type { CSSProperties } from 'react';
import { AudioLevelMeter } from './AudioLevelMeter';

export interface MediaControlBarProps {
  micOn: boolean;
  camOn: boolean;
  screenSharing?: boolean;
  handRaised?: boolean;
  audioLevel?: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleScreen?: () => void;
  onToggleHand?: () => void;
  onLeave?: () => void;
  onOpenSettings?: () => void;
  className?: string;
  style?: CSSProperties;
}

const CONTROL_BUTTON_BASE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '42px',
  height: '42px',
  borderRadius: '50%',
  border: 'none',
  cursor: 'pointer',
  transition: 'all 150ms ease',
  outline: 'none',
};

export function MediaControlBar({
  micOn,
  camOn,
  screenSharing = false,
  handRaised = false,
  audioLevel = 0,
  onToggleMic,
  onToggleCam,
  onToggleScreen,
  onToggleHand,
  onLeave,
  onOpenSettings,
  className,
  style,
}: MediaControlBarProps) {
  return (
    <div
      className={className ?? 'ulive-control-bar'}
      role="toolbar"
      aria-label="Live media controls"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 14px',
        borderRadius: '9999px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        ...style,
      }}
    >
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          type="button"
          onClick={onToggleMic}
          aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
          aria-pressed={micOn}
          style={{
            ...CONTROL_BUTTON_BASE,
            backgroundColor: micOn ? 'rgba(255, 255, 255, 0.15)' : '#ef4444',
            color: '#ffffff',
          }}
        >
          {micOn ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>

        {micOn && audioLevel > 5 && (
          <div
            style={{
              position: 'absolute',
              bottom: '-2px',
              right: '2px',
              pointerEvents: 'none',
            }}
          >
            <AudioLevelMeter level={audioLevel} size="sm" bars={3} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleCam}
        aria-label={camOn ? 'Turn off camera' : 'Turn on camera'}
        aria-pressed={camOn}
        style={{
          ...CONTROL_BUTTON_BASE,
          backgroundColor: camOn ? 'rgba(255, 255, 255, 0.15)' : '#ef4444',
          color: '#ffffff',
        }}
      >
        {camOn ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m22 8-6 4 6 4V8Z" />
            <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="m22 8-6 4 6 4V8Z" />
            <path d="M2 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
          </svg>
        )}
      </button>

      {onToggleScreen && (
        <button
          type="button"
          onClick={onToggleScreen}
          aria-label={screenSharing ? 'Stop sharing screen' : 'Share screen'}
          aria-pressed={screenSharing}
          style={{
            ...CONTROL_BUTTON_BASE,
            backgroundColor: screenSharing ? '#2563eb' : 'rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect width="20" height="14" x="2" y="3" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>
      )}

      {onToggleHand && (
        <button
          type="button"
          onClick={onToggleHand}
          aria-label={handRaised ? 'Lower hand' : 'Raise hand'}
          aria-pressed={handRaised}
          style={{
            ...CONTROL_BUTTON_BASE,
            backgroundColor: handRaised ? '#eab308' : 'rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            fontSize: '18px',
          }}
        >
          👋
        </button>
      )}

      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Device settings"
          style={{
            ...CONTROL_BUTTON_BASE,
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      )}

      {onLeave && (
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave room"
          style={{
            ...CONTROL_BUTTON_BASE,
            backgroundColor: '#ef4444',
            color: '#ffffff',
            marginLeft: '4px',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.8 19.8 0 0 1-3.11-8.69A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
            <line x1="22" y1="2" x2="2" y2="22" />
          </svg>
        </button>
      )}
    </div>
  );
}
