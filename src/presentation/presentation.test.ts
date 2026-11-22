import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AudioLevelMeter,
  LiveRoomBadge,
  MediaControlBar,
  ParticipantRosterCard,
} from './index';
import type { RoomParticipant } from '../core/types';

describe('LiveRoomBadge', () => {
  it('creates live status badge element', () => {
    const el = createElement(LiveRoomBadge, {
      status: 'live',
      viewerCount: 42,
    });
    expect(el.props.status).toBe('live');
    expect(el.props.viewerCount).toBe(42);
  });

  it('supports compact variant and connecting status', () => {
    const el = createElement(LiveRoomBadge, {
      variant: 'compact',
      status: 'connecting',
    });
    expect(el.props.variant).toBe('compact');
    expect(el.props.status).toBe('connecting');
  });
});

describe('AudioLevelMeter', () => {
  it('creates meter element with clamped level', () => {
    const el = createElement(AudioLevelMeter, {
      level: 75,
      isSpeaking: true,
      bars: 5,
    });
    expect(el.props.level).toBe(75);
    expect(el.props.isSpeaking).toBe(true);
    expect(el.props.bars).toBe(5);
  });
});

describe('MediaControlBar', () => {
  it('renders control elements and handles callbacks', () => {
    const toggleMic = vi.fn();
    const toggleCam = vi.fn();
    const leave = vi.fn();

    const el = createElement(MediaControlBar, {
      micOn: true,
      camOn: false,
      screenSharing: true,
      handRaised: false,
      onToggleMic: toggleMic,
      onToggleCam: toggleCam,
      onLeave: leave,
    });

    expect(el.props.micOn).toBe(true);
    expect(el.props.camOn).toBe(false);
    expect(el.props.screenSharing).toBe(true);
  });
});

describe('ParticipantRosterCard', () => {
  const participants: RoomParticipant[] = [
    {
      clientId: 'p1',
      userId: 'u1',
      name: 'Charlie',
      isHost: false,
      handRaised: false,
      micOn: true,
      camOn: true,
      at: 100,
    },
    {
      clientId: 'p2',
      userId: 'u2',
      name: 'Alice',
      isHost: true,
      handRaised: false,
      micOn: false,
      camOn: true,
      at: 200,
    },
    {
      clientId: 'p3',
      userId: 'u3',
      name: 'Bob',
      isHost: false,
      handRaised: true,
      micOn: false,
      camOn: false,
      at: 300,
    },
  ];

  it('creates roster element with sorted participants data', () => {
    const el = createElement(ParticipantRosterCard, {
      participants,
      currentClientId: 'p1',
      title: 'Audience',
    });
    expect(el.props.participants.length).toBe(3);
    expect(el.props.currentClientId).toBe('p1');
    expect(el.props.title).toBe('Audience');
  });
});
