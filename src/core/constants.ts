/**
 * Wire constants every live-room participant agrees on. The server side of
 * any transport MUST honor the TTLs — clients rely on them for roster and
 * reaction freshness, and no explicit "leave" message exists anywhere.
 */

/** Presence heartbeat cadence (client → server). */
export const PRESENCE_BEAT_MS = 8_000
/** Server prunes a participant slot after this much silence. */
export const PRESENCE_TTL_MS = 25_000
/** Signals older than this are swept from the mailbox by the server. */
export const SIGNAL_TTL_MS = 300_000
/** Reactions are pruned to a sliding window of this length. */
export const REACTION_WINDOW_MS = 15_000
/** Signaling consume cadence while a handshake is still in flight. */
export const SIGNAL_FAST_POLL_MS = 1_000
/** Signaling consume cadence once every peer is connected. */
export const SIGNAL_STEADY_POLL_MS = 4_000
/** Floor for the signaling cadence while the tab is hidden. */
export const SIGNAL_HIDDEN_POLL_MS = 8_000
/** Room-doc poll cadence while the tab is visible. */
export const ROOM_SYNC_POLL_MS = 4_000
/** Room-doc poll cadence while the tab is hidden. */
export const ROOM_SYNC_HIDDEN_POLL_MS = 8_000
/** Room-doc poll backoff after repeated failures. */
export const ROOM_SYNC_BACKOFF_MS = 30_000
/** Failures tolerated before the room-doc poll backs off. */
export const ROOM_SYNC_FAILURE_LIMIT = 3
/** Chat history kept per room doc (server-enforced cap, mirrored here). */
export const CHAT_MAX_MESSAGES = 200
/** Shared-notes debounce before a PUT (typing cadence, not per keystroke). */
export const NOTES_DEBOUNCE_MS = 500