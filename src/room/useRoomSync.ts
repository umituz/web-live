import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, LessonSlide, RoomReaction } from '../core'
import { parseRoomMainDoc } from '../core'
import {
  NOTES_DEBOUNCE_MS,
  ROOM_SYNC_BACKOFF_MS,
  ROOM_SYNC_FAILURE_LIMIT,
  ROOM_SYNC_HIDDEN_POLL_MS,
  ROOM_SYNC_POLL_MS,
} from '../core/constants'
import type { RoomSyncTransport } from './transport'

const CHAT_SEND_ATTEMPTS = 3
const CHAT_RETRY_DELAY_MS = 1_000

let localIdSeq = 0

/**
 * Optimistic-entry ids only have to be unique within this tab's session —
 * a monotonic counter plus randomness keeps two hooks (or a strict-mode
 * double render) from ever colliding. Local stand-in for the design-system
 * uniqueId helper, so the package pulls in no dependencies for it.
 */
export function localId(prefix: string): string {
  localIdSeq += 1
  return `${prefix}-${localIdSeq}-${Math.random().toString(36).slice(2, 10)}`
}

/** One rendered slide of the effective deck (static text or host-pinned file). */
export interface RoomSyncSlide {
  title: string
  content: string
  /** File-backed slide — the stage renders the room file itself. ext and
   * contentType are optional because the canonical room doc pins carry only
   * the fileId; apps that need them resolve them from their file list. */
  file?: { fileId: string; ext?: string; contentType?: string }
}

/** Whether two decks are the same pins in the same order (setState guard). */
function sameDeck(prev: LessonSlide[], next: LessonSlide[]): boolean {
  return prev.length === next.length && prev.every((slide, i) => slide.fileId === next[i]?.fileId)
}

export interface RoomSyncState {
  messages: ChatMessage[]
  chatInput: string
  setChatInput: (value: string) => void
  sendMessage: () => void
  lessonNotes: string
  changeNotes: (notes: string) => void
  blurNotes: () => void
  focusNotes: () => void
  currentSlideIdx: number
  changeSlide: (nextIdx: number) => void
  stampWordToNotes: (word: string, meaning: string) => void
  /** Effective deck: the host's pinned files when set, else the static deck. */
  slides: RoomSyncSlide[]
  /** Raw host-pinned deck (empty when the room uses the static slides). */
  roomSlides: LessonSlide[]
  /** clientId of whoever holds the screen-share slot, or null. */
  screenSharerId: string | null
  /** Server-driven focus hint ('presentation' while sharing, else 'speaker'). */
  serverLayout: string
  /** Ephemeral emoji reactions inside the flying window (server-pruned). */
  reactions: RoomReaction[]
  /** Fires a reaction; renders optimistically, best-effort on the wire. */
  sendReaction: (emoji: string) => void
  /** True while the host captures a recording — everyone sees the banner. */
  recordingActive: boolean
  /** Display label of the capturing host ('' when idle). */
  recordingBy: string
}

/**
 * Room-document sync. Every participant polls the shared doc on a
 * setTimeout chain (4s visible / 8s hidden, 30s backoff after repeated
 * failures, hard stop once the session is dead with 401/403) and writes
 * through the same transport: optimistic chat with retries and rollback,
 * debounced shared notes behind an editing lock, the slide pointer, and
 * emoji reactions. The transport is the only seam — bind it with
 * createHttpRoomSyncTransport or implement your own.
 */
export function useRoomSync({
  transport,
  sender,
  staticSlides,
}: {
  /** Bound to one room by the caller; null while there is no room to sync. */
  transport: RoomSyncTransport | null
  /** This client's label, stamped on its own chat lines and reactions. */
  sender: string
  /** Fallback deck — used until the host pins files as slides. */
  staticSlides: RoomSyncSlide[]
}): RoomSyncState {
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [lessonNotes, setLessonNotes] = useState('')
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0)
  const [roomSlides, setRoomSlides] = useState<LessonSlide[]>([])
  const [screenSharerId, setScreenSharerId] = useState<string | null>(null)
  const [reactions, setReactions] = useState<RoomReaction[]>([])
  const [recordingActive, setRecordingActive] = useState(false)
  const [recordingBy, setRecordingBy] = useState('')

  const notesEditingRef = useRef(false)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingNotesRef = useRef<string | null>(null)
  const pendingChatRef = useRef<ChatMessage[]>([])

  // The host's pinned file deck wins when set; the static deck is the
  // fallback every room can render without any setup.
  const slides = useMemo(
    () =>
      roomSlides.length > 0
        ? roomSlides.map((slide) => ({
            title: slide.title,
            content: '',
            file: { fileId: slide.fileId },
          }))
        : staticSlides,
    [roomSlides, staticSlides],
  )
  const slidesRef = useRef(slides)
  slidesRef.current = slides

  // A deck swap must not strand the viewer past the last slide.
  useEffect(() => {
    setCurrentSlideIdx((idx) => Math.min(idx, Math.max(0, slides.length - 1)))
  }, [slides.length])

  useEffect(() => {
    if (!transport) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let failures = 0

    const schedule = (delay: number) => {
      timer = setTimeout(() => void run(), delay)
    }

    const run = async () => {
      try {
        const doc = parseRoomMainDoc(await transport.fetchMain())

        if (!alive) return
        failures = 0

        // Server lines first, then own lines the server has not echoed
        // back yet — the pending list is exactly what survives this filter.
        const serverIds = new Set(doc.chat.map((message) => message.id))
        const pending = pendingChatRef.current.filter((message) => !serverIds.has(message.id))
        pendingChatRef.current = pending
        setMessages([...doc.chat, ...pending])

        // Empty strings apply too: a peer deleting all notes must propagate
        // (the editing lock still protects the textarea while typing).
        if (!notesEditingRef.current) {
          setLessonNotes(doc.notes)
        }
        const slideCount = slidesRef.current.length
        setCurrentSlideIdx(Math.min(Math.max(0, doc.slide), Math.max(0, slideCount - 1)))
        // Identity-guarded: the poll fires every few seconds, but the deck
        // only changes when the host edits it.
        setRoomSlides((prev) => (sameDeck(prev, doc.slides) ? prev : doc.slides))
        setScreenSharerId(
          doc.screenSharerId !== null && doc.screenSharerId.length > 0
            ? doc.screenSharerId
            : null,
        )
        setReactions(doc.reactions)
        setRecordingActive(doc.recordingActive)
        setRecordingBy(doc.recordingBy)

        schedule(document.visibilityState === 'hidden' ? ROOM_SYNC_HIDDEN_POLL_MS : ROOM_SYNC_POLL_MS)
      } catch (err) {
        if (!alive) return
        const status = (err as { status?: number } | null)?.status
        if (status === 401 || status === 403) return
        failures += 1
        schedule(failures >= ROOM_SYNC_FAILURE_LIMIT ? ROOM_SYNC_BACKOFF_MS : ROOM_SYNC_POLL_MS)
      }
    }

    void run()
    return () => {
      alive = false
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [transport])

  const sendMessage = () => {
    if (!chatInput.trim()) return

    const userMsg: ChatMessage = {
      id: localId('chat'),
      at: Date.now(),
      sender,
      text: chatInput.trim(),
    }

    setMessages((prev) => [...prev, userMsg])
    setChatInput('')

    if (!transport) return

    pendingChatRef.current = [...pendingChatRef.current, userMsg]

    const send = async (attempt: number): Promise<void> => {
      try {
        await transport.sendChat({ sender: userMsg.sender, text: userMsg.text, id: userMsg.id })
      } catch {
        if (attempt < CHAT_SEND_ATTEMPTS) {
          window.setTimeout(() => void send(attempt + 1), CHAT_RETRY_DELAY_MS * attempt)
          return
        }
        // Final failure: roll the optimistic line back and put the text
        // back into the composer so nothing the user typed is lost.
        pendingChatRef.current = pendingChatRef.current.filter((message) => message.id !== userMsg.id)
        setMessages((prev) => prev.filter((message) => message.id !== userMsg.id))
        setChatInput((prev) => (prev.trim() ? `${prev} ${userMsg.text}` : userMsg.text))
      }
    }

    void send(1)
  }

  const pushNotes = useCallback(
    (notes: string) => {
      if (!transport) return
      pendingNotesRef.current = null
      transport.putNotes(notes).catch(() => {})
    },
    [transport],
  )

  const changeNotes = (newNotes: string) => {
    setLessonNotes(newNotes)
    if (!transport) return
    if (notesTimerRef.current !== undefined) clearTimeout(notesTimerRef.current)
    pendingNotesRef.current = newNotes
    notesTimerRef.current = setTimeout(() => {
      notesTimerRef.current = undefined
      pushNotes(newNotes)
    }, NOTES_DEBOUNCE_MS)
  }

  const focusNotes = () => {
    notesEditingRef.current = true
  }

  const blurNotes = () => {
    notesEditingRef.current = false
    const pending = pendingNotesRef.current
    if (pending === null) return
    if (notesTimerRef.current !== undefined) {
      clearTimeout(notesTimerRef.current)
      notesTimerRef.current = undefined
    }
    pushNotes(pending)
  }

  useEffect(() => {
    return () => {
      if (notesTimerRef.current !== undefined) clearTimeout(notesTimerRef.current)
      const pending = pendingNotesRef.current
      if (pending !== null) pushNotes(pending)
    }
  }, [pushNotes])

  const changeSlide = (nextIdx: number) => {
    setCurrentSlideIdx(nextIdx)
    if (transport) {
      transport.putSlide(nextIdx).catch(() => {})
    }
  }

  const stampWordToNotes = (word: string, meaning: string) => {
    const updated = `${lessonNotes}\n• ${word} = ${meaning}`
    changeNotes(updated)
  }

  const sendReaction = (emoji: string) => {
    if (!transport || emoji.trim().length === 0) return
    const optimistic: RoomReaction = {
      id: localId('rx'),
      emoji,
      sender,
      at: Date.now(),
    }
    // Own reaction shows immediately; the next poll reconciles with the
    // server window (and quietly drops it if the post failed).
    setReactions((prev) => [...prev, optimistic].slice(-24))
    transport.sendReaction(emoji).catch(() => {})
  }

  // The canonical doc carries no layout field: the server sets it to
  // 'presentation' exactly while the screen slot is held, so it derives.
  const serverLayout = screenSharerId === null ? 'speaker' : 'presentation'

  return {
    messages,
    chatInput,
    setChatInput,
    sendMessage,
    lessonNotes,
    changeNotes,
    blurNotes,
    focusNotes,
    currentSlideIdx,
    changeSlide,
    stampWordToNotes,
    slides,
    roomSlides,
    screenSharerId,
    serverLayout,
    reactions,
    sendReaction,
    recordingActive,
    recordingBy,
  }
}
