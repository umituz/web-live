import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatMessage, LessonSlide, RoomReaction } from '../core'
import { parseRoomMainDoc } from '../core'
import {
  NOTES_DEBOUNCE_MS,
  ROOM_BACKOFF_MS,
  ROOM_POLL_FAILURE_LIMIT,
  ROOM_POLL_HIDDEN_MS,
  ROOM_POLL_MS,
} from '../core/constants'
import type { RoomDocTransport } from './transport'

const CHAT_SEND_ATTEMPTS = 3
const CHAT_RETRY_DELAY_MS = 1_000

let localIdSeq = 0

export function localId(prefix: string): string {
  localIdSeq += 1
  return `${prefix}-${localIdSeq}-${Math.random().toString(36).slice(2, 10)}`
}

export interface RoomSlide {
  title: string
  content: string

  file?: { fileId: string; ext?: string; contentType?: string }
}

function sameDeck(prev: LessonSlide[], next: LessonSlide[]): boolean {
  return prev.length === next.length && prev.every((slide, i) => slide.fileId === next[i]?.fileId)
}

type RoomMainDoc = ReturnType<typeof parseRoomMainDoc>

function startRoomDocPolling(
  transport: RoomDocTransport,
  onDoc: (doc: RoomMainDoc) => void,
): () => void {
  let alive = true
  let timer: ReturnType<typeof setTimeout> | undefined
  let failures = 0

  const run = async () => {
    try {
      const doc = parseRoomMainDoc(await transport.fetchMain())
      if (!alive) return
      failures = 0
      onDoc(doc)
      timer = setTimeout(
        () => void run(),
        document.visibilityState === 'hidden' ? ROOM_POLL_HIDDEN_MS : ROOM_POLL_MS,
      )
    } catch (err) {
      if (!alive) return
      const status = (err as { status?: number } | null)?.status
      if (status === 401 || status === 403) return
      failures += 1
      timer = setTimeout(
        () => void run(),
        failures >= ROOM_POLL_FAILURE_LIMIT ? ROOM_BACKOFF_MS : ROOM_POLL_MS,
      )
    }
  }

  void run()
  return () => {
    alive = false
    clearTimeout(timer)
  }
}

export interface RoomDocState {
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

  slides: RoomSlide[]

  roomSlides: LessonSlide[]

  screenSharerId: string | null

  serverLayout: string

  reactions: RoomReaction[]

  sendReaction: (emoji: string) => void

  recordingActive: boolean

  recordingBy: string
}

export function useRoomDoc({
  transport,
  sender,
  staticSlides,
}: {

  transport: RoomDocTransport | null

  sender: string

  staticSlides: RoomSlide[]
}): RoomDocState {
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
  useEffect(() => {
    slidesRef.current = slides
  })

  useEffect(() => {
    setCurrentSlideIdx((idx) => Math.min(idx, Math.max(0, slides.length - 1)))
  }, [slides.length])

  const applyDoc = useCallback((doc: RoomMainDoc) => {
    const serverIds = new Set(doc.chat.map((message) => message.id))
    const pending = pendingChatRef.current.filter((message) => !serverIds.has(message.id))
    pendingChatRef.current = pending
    setMessages([...doc.chat, ...pending])

    if (!notesEditingRef.current) {
      setLessonNotes(doc.notes)
    }
    const slideCount = slidesRef.current.length
    setCurrentSlideIdx(Math.min(Math.max(0, doc.slide), Math.max(0, slideCount - 1)))

    setRoomSlides((prev) => (sameDeck(prev, doc.slides) ? prev : doc.slides))
    setScreenSharerId(
      doc.screenSharerId !== null && doc.screenSharerId.length > 0
        ? doc.screenSharerId
        : null,
    )
    setReactions(doc.reactions)
    setRecordingActive(doc.recordingActive)
    setRecordingBy(doc.recordingBy)
  }, [])

  useEffect(() => {
    if (!transport) return
    return startRoomDocPolling(transport, applyDoc)
  }, [transport, applyDoc])

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

    setReactions((prev) => [...prev, optimistic].slice(-24))
    transport.sendReaction(emoji).catch(() => {})
  }

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
