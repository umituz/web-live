import type { CSSProperties, ChangeEvent } from 'react';
import { useState } from 'react';
import type { RoomParticipant } from '../core/types';

export interface ParticipantRosterCardProps {
  participants: RoomParticipant[];
  currentClientId?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

export function ParticipantRosterCard({
  participants,
  currentClientId,
  title = 'Participants',
  className,
  style,
}: ParticipantRosterCardProps) {
  const [search, setSearch] = useState('');

  const filtered = participants.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const sorted = [...filtered].sort((a, b) => {
    if (a.handRaised && !b.handRaised) return -1;
    if (!a.handRaised && b.handRaised) return 1;
    if (a.isHost && !b.isHost) return -1;
    if (!a.isHost && b.isHost) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div
      className={className ?? 'ulive-roster-card'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '10px',
        border: '1px solid rgba(128, 128, 128, 0.2)',
        background: '#ffffff',
        overflow: 'hidden',
        fontFamily: 'inherit',
        maxHeight: '400px',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid rgba(128, 128, 128, 0.15)',
          background: 'rgba(128, 128, 128, 0.03)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '13px' }}>
          {title} ({participants.length})
        </span>
      </div>

      {participants.length > 4 && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(128, 128, 128, 0.1)' }}>
          <input
            type="search"
            value={search}
            placeholder="Search participants…"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '12px',
              borderRadius: '6px',
              border: '1px solid rgba(128, 128, 128, 0.2)',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {sorted.map((participant) => {
          const isYou = participant.clientId === currentClientId;
          return (
            <div
              key={participant.clientId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                borderRadius: '6px',
                background: participant.handRaised
                  ? 'rgba(234, 179, 8, 0.1)'
                  : 'transparent',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: participant.isHost ? '#2563eb' : '#64748b',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  {participant.name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: isYou ? 600 : 400 }}>
                    {participant.name}
                  </span>
                  {isYou && (
                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>
                      (You)
                    </span>
                  )}
                  {participant.isHost && (
                    <span
                      style={{
                        marginLeft: '6px',
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: 'rgba(37, 99, 235, 0.15)',
                        color: '#2563eb',
                      }}
                    >
                      Host
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {participant.handRaised && (
                  <span aria-label="Hand raised" style={{ fontSize: '14px' }}>
                    👋
                  </span>
                )}

                <span
                  aria-label={participant.micOn ? 'Microphone on' : 'Muted'}
                  style={{ color: participant.micOn ? '#10b981' : '#ef4444' }}
                >
                  {participant.micOn ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="2" y1="2" x2="22" y2="22" />
                      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                      <path d="M5 10v2a7 7 0 0 0 12 5" />
                      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                    </svg>
                  )}
                </span>

                <span
                  aria-label={participant.camOn ? 'Camera on' : 'Camera off'}
                  style={{ color: participant.camOn ? '#10b981' : '#94a3b8' }}
                >
                  {participant.camOn ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m22 8-6 4 6 4V8Z" />
                      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="2" y1="2" x2="22" y2="22" />
                      <path d="m22 8-6 4 6 4V8Z" />
                      <path d="M2 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
                    </svg>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
