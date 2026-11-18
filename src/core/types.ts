export type JsonRequest = <T>(
  url: string,
  init: { method: string; json?: unknown },
) => Promise<T>

export interface RoomParticipant {

  clientId: string

  userId: string
  name: string
  isHost: boolean
  handRaised: boolean
  micOn: boolean
  camOn: boolean

  at: number
}

export interface ChatMessage {
  id: string
  at: number
  sender: string
  text: string
}

export interface RoomReaction {
  id: string
  at: number
  sender: string
  emoji: string
}

export interface LessonSlide {
  fileId: string
  title: string
}

export interface RoomMainDoc {
  chat: ChatMessage[]
  notes: string
  slide: number
  screenSharerId: string | null
  reactions: RoomReaction[]
  slides: LessonSlide[]
  recordingActive: boolean
  recordingBy: string
  participants: RoomParticipant[]
}

export function parseRoomMainDoc(raw: unknown): RoomMainDoc {
  const doc = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    chat: parseList(doc.chat, isChatMessage),
    notes: typeof doc.notes === 'string' ? doc.notes : '',
    slide: typeof doc.slide === 'number' ? doc.slide : 0,
    screenSharerId: typeof doc.screenSharerId === 'string' ? doc.screenSharerId : null,
    reactions: parseList(doc.reactions, isRoomReaction),
    slides: parseList(doc.slides, isLessonSlide),
    recordingActive: doc.recordingActive === true,
    recordingBy: typeof doc.recordingBy === 'string' ? doc.recordingBy : '',
    participants: parseParticipants(doc.participants),
  }
}

export function parseParticipants(raw: unknown): RoomParticipant[] {
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null
      ? Object.values(raw)
      : []
  return source.filter(
    (entry): entry is RoomParticipant =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as RoomParticipant).clientId === 'string' &&
      (entry as RoomParticipant).clientId.length > 0,
  )
}

function parseList<T>(raw: unknown, guard: (entry: unknown) => entry is T): T[] {
  return Array.isArray(raw) ? raw.filter(guard) : []
}

function isChatMessage(entry: unknown): entry is ChatMessage {
  if (typeof entry !== 'object' || entry === null) return false
  const msg = entry as Record<string, unknown>
  return typeof msg.id === 'string' && typeof msg.text === 'string' && typeof msg.sender === 'string'
}

function isRoomReaction(entry: unknown): entry is RoomReaction {
  if (typeof entry !== 'object' || entry === null) return false
  const reaction = entry as Record<string, unknown>
  return typeof reaction.id === 'string' && typeof reaction.emoji === 'string'
}

function isLessonSlide(entry: unknown): entry is LessonSlide {
  if (typeof entry !== 'object' || entry === null) return false
  const slide = entry as Record<string, unknown>
  return typeof slide.fileId === 'string' && typeof slide.title === 'string'
}
