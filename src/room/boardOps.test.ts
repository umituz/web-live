import { describe, expect, it } from 'vitest'
import {
  applyBoardOp,
  boardDeltaFor,
  denormalizeStrokeForCanvas,
  normalizeStrokeForWire,
  BOARD_OPS_CAP,
  BOARD_STROKE_CAP,
  type BoardDocState,
} from './boardOps'

const emptyBoard = (): BoardDocState => ({ epoch: 0, seq: 0, strokes: [], ops: [] })

const wireStroke = () => ({
  size: 0.01,
  color: '#1c1917',
  points: [
    { x: 0.1, y: 0.2, pressure: 0.5 },
    { x: 0.3, y: 0.4 },
  ],
})

describe('normalizeStrokeForWire / denormalizeStrokeForCanvas', () => {
  it('round-trips through a different canvas size with ratios intact', () => {
    const pixel = {
      size: 12,
      color: '#dc2626',
      dynamic: true,
      points: [
        { x: 400, y: 150, pressure: 0.75 },
        { x: 800, y: 300 },
      ],
    }
    const wire = normalizeStrokeForWire(pixel, 1600, 900)
    expect(wire.size).toBeCloseTo(12 / 1600, 4)
    expect(wire.points[0]).toEqual({ x: 0.25, y: 0.1667, pressure: 0.75 })

    const back = denormalizeStrokeForCanvas({ ...wire, by: 'cl-1', seq: 3 }, 800, 450)
    expect(back.size).toBeCloseTo(6, 4)
    expect(back.points[0]?.x).toBeCloseTo(200, 4)

    expect(back.points[0]?.y).toBeCloseTo(75, 1)
    expect(back.dynamic).toBe(true)
  })

  it('clamps out-of-canvas points and keeps precision bounded', () => {
    const wire = normalizeStrokeForWire(
      {
        size: 4,
        color: '#000000',
        points: [{ x: -50, y: 9999 }],
      },
      1000,
      500,
    )
    expect(wire.points[0]).toEqual({ x: 0, y: 1 })
    const decimals = String(wire.points[0]?.y ?? 0).split('.')[1] ?? ''
    expect(decimals.length).toBeLessThanOrEqual(4)
  })
})

describe('applyBoardOp', () => {
  it('stamps adds with by/seq and journals them in order', () => {
    const first = applyBoardOp(emptyBoard(), { op: 'add', by: 'cl-a', stroke: wireStroke() })
    const second = applyBoardOp(first!.board, { op: 'add', by: 'cl-b', stroke: wireStroke() })
    expect(second!.board.seq).toBe(2)
    expect(second!.board.strokes.map((s) => [s.by, s.seq])).toEqual([
      ['cl-a', 1],
      ['cl-b', 2],
    ])
    expect(second!.board.ops.map((o) => o.seq)).toEqual([1, 2])
  })

  it('undo drops only the author\'s own newest stroke', () => {
    let board = emptyBoard()
    board = applyBoardOp(board, { op: 'add', by: 'cl-a', stroke: wireStroke() })!.board
    board = applyBoardOp(board, { op: 'add', by: 'cl-b', stroke: wireStroke() })!.board
    board = applyBoardOp(board, { op: 'add', by: 'cl-a', stroke: wireStroke() })!.board

    const undone = applyBoardOp(board, { op: 'undo', by: 'cl-a' })!

    expect(undone.board.strokes.map((s) => s.seq)).toEqual([1, 2])
    expect(undone.record).toEqual({ seq: 4, kind: 'undo', by: 'cl-a', strokeSeq: 3 })

    const again = applyBoardOp(undone.board, { op: 'undo', by: 'cl-a' })!
    expect(again.board.strokes.map((s) => s.seq)).toEqual([2])

    const noop = applyBoardOp(again.board, { op: 'undo', by: 'cl-a' })
    expect(noop).toBeNull()
  })

  it('clear bumps the epoch, empties strokes and restarts the journal', () => {
    let board = emptyBoard()
    board = applyBoardOp(board, { op: 'add', by: 'cl-a', stroke: wireStroke() })!.board
    const cleared = applyBoardOp(board, { op: 'clear', by: 'cl-host', epoch: board.epoch })!
    expect(cleared.board).toEqual({
      epoch: 1,
      seq: 2,
      strokes: [],
      ops: [{ seq: 2, kind: 'clear', by: 'cl-host', epoch: 1 }],
    })
  })

  it('caps strokes at 300 (oldest fall off) and ops at 64', () => {
    let board = emptyBoard()
    for (let i = 0; i < BOARD_STROKE_CAP + 5; i += 1) {
      board = applyBoardOp(board, { op: 'add', by: 'cl-a', stroke: wireStroke() })!.board
    }
    expect(board.strokes.length).toBe(BOARD_STROKE_CAP)
    expect(board.strokes[0]?.seq).toBe(6)
    expect(board.ops.length).toBe(BOARD_OPS_CAP)
  })

  it('sanitizes hostile input instead of trusting the client', () => {
    const applied = applyBoardOp(emptyBoard(), {
      op: 'add',
      by: 'cl-a',
      stroke: {
        size: 0.9,
        color: '#111111',
        points: Array.from({ length: 600 }, (_, i) => ({ x: i / 100, y: 2 })),
      },
    })
    const stored = applied!.board.strokes[0]!
    expect(stored.size).toBe(0.5)
    expect(stored.points.length).toBe(512)
    expect(stored.points[0]?.y).toBe(1)
  })
})

describe('boardDeltaFor', () => {
  const boardWith = (ops: number, epoch = 0): BoardDocState => {
    let board = emptyBoard()
    for (let i = 0; i < ops; i += 1) {
      board = applyBoardOp(board, { op: 'add', by: `cl-${i}`, stroke: wireStroke() })!.board
    }
    return { ...board, epoch }
  }

  it('returns full when the epoch moved or the client never synced', () => {
    const board = boardWith(1, 2)
    expect(boardDeltaFor(board, 2, 1).kind).toBe('synced')
    expect(boardDeltaFor(board, 1, 1).kind).toBe('full')
    expect(boardDeltaFor(board, -1, 0).kind).toBe('full')
  })

  it('returns only ops after the cursor when the window covers it', () => {
    const board = boardWith(4)
    const delta = boardDeltaFor(board, 0, 1)
    expect(delta.kind).toBe('delta')
    if (delta.kind !== 'delta') return
    expect(delta.ops.map((o) => o.seq)).toEqual([2, 3, 4])
    expect(boardDeltaFor(board, 0, 4).kind).toBe('synced')
  })

  it('falls back to full when the client fell behind the journal window', () => {
    const board = boardWith(BOARD_OPS_CAP + 2)

    expect(boardDeltaFor(board, 0, 0).kind).toBe('full')

    const inWindow = board.ops[0]!.seq - 1
    expect(boardDeltaFor(board, 0, inWindow).kind).toBe('delta')
  })
})
