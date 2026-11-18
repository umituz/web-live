export interface BoardPoint {
  x: number
  y: number
  pressure?: number
}

export interface BoardStroke {
  size: number
  color: string
  dynamic?: boolean
  points: BoardPoint[]

  by?: string

  seq?: number
}

export type BoardOpPayload =
  | { op: 'add'; by: string; stroke: Omit<BoardStroke, 'by' | 'seq'> }
  | { op: 'undo'; by: string }
  | { op: 'clear'; by: string; epoch: number }

export interface BoardOpRecord {
  seq: number
  kind: 'add' | 'undo' | 'clear'
  by: string

  stroke?: BoardStroke
  strokeSeq?: number

  epoch?: number
}

export interface BoardDocState {
  epoch: number
  seq: number
  strokes: BoardStroke[]
  ops: BoardOpRecord[]
}

export const BOARD_STROKE_CAP = 300
export const BOARD_OPS_CAP = 64

const WIRE_PRECISION = 10_000

function roundWire(value: number): number {
  return Math.round(value * WIRE_PRECISION) / WIRE_PRECISION
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function normalizeStrokeForWire(
  stroke: { size: number; color: string; dynamic?: boolean; points: { x: number; y: number; pressure?: number }[] },
  width: number,
  height: number,
): Omit<BoardStroke, 'by' | 'seq'> {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  return {
    size: roundWire(clamp(stroke.size / w, 0.001, 0.5)),
    color: stroke.color,
    ...(stroke.dynamic === undefined ? {} : { dynamic: stroke.dynamic }),
    points: stroke.points.slice(0, 512).map((point) => ({
      x: roundWire(clamp(point.x / w, 0, 1)),
      y: roundWire(clamp(point.y / h, 0, 1)),
      ...(point.pressure === undefined ? {} : { pressure: roundWire(clamp(point.pressure, 0, 1)) }),
    })),
  }
}

export function denormalizeStrokeForCanvas(
  stroke: BoardStroke,
  width: number,
  height: number,
): { size: number; color: string; dynamic: boolean; points: { x: number; y: number; pressure: number }[] } {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  return {
    size: Math.max(0.5, stroke.size * w),
    color: stroke.color,
    dynamic: stroke.dynamic === true,
    points: stroke.points.map((point) => ({
      x: point.x * w,
      y: point.y * h,
      pressure: point.pressure ?? 0.5,
    })),
  }
}

export function sanitizeBoardStroke(stroke: Omit<BoardStroke, 'by' | 'seq'>): Omit<BoardStroke, 'by' | 'seq'> {
  return {
    size: roundWire(clamp(stroke.size, 0.001, 0.5)),
    color: stroke.color,
    ...(stroke.dynamic === undefined ? {} : { dynamic: stroke.dynamic === true }),
    points: stroke.points.slice(0, 512).map((point) => ({
      x: roundWire(clamp(point.x, 0, 1)),
      y: roundWire(clamp(point.y, 0, 1)),
      ...(point.pressure === undefined
        ? {}
        : { pressure: roundWire(clamp(point.pressure, 0, 1)) }),
    })),
  }
}

export interface AppliedBoardOp {
  board: BoardDocState
  record: BoardOpRecord
}

export function applyBoardOp(
  board: BoardDocState,
  payload: BoardOpPayload,
): AppliedBoardOp | null {
  const seq = board.seq + 1

  if (payload.op === 'add') {
    const stroke: BoardStroke = {
      ...sanitizeBoardStroke(payload.stroke),
      by: payload.by,
      seq,
    }
    const strokes = [...board.strokes, stroke].slice(-BOARD_STROKE_CAP)
    const record: BoardOpRecord = { seq, kind: 'add', by: payload.by, stroke }
    return {
      board: {
        epoch: board.epoch,
        seq,
        strokes,
        ops: [...board.ops, record].slice(-BOARD_OPS_CAP),
      },
      record,
    }
  }

  if (payload.op === 'undo') {
    for (let i = board.strokes.length - 1; i >= 0; i -= 1) {
      const stroke = board.strokes[i]
      if (stroke?.by === payload.by) {
        const strokes = board.strokes.filter((_, index) => index !== i)
        const record: BoardOpRecord = { seq, kind: 'undo', by: payload.by, strokeSeq: stroke.seq }
        return {
          board: {
            epoch: board.epoch,
            seq,
            strokes,
            ops: [...board.ops, record].slice(-BOARD_OPS_CAP),
          },
          record,
        }
      }
    }
    return null
  }

  const epoch = board.epoch + 1
  const record: BoardOpRecord = { seq, kind: 'clear', by: payload.by, epoch }
  return {
    board: { epoch, seq, strokes: [], ops: [record] },
    record,
  }
}

export type BoardDelta =
  | { kind: 'full'; board: BoardDocState }
  | { kind: 'delta'; ops: BoardOpRecord[]; epoch: number; seq: number }
  | { kind: 'synced'; epoch: number; seq: number };

export function boardDeltaFor(
  board: BoardDocState,
  clientEpoch: number,
  clientSince: number,
): BoardDelta {
  if (clientEpoch !== board.epoch) return { kind: 'full', board }
  if (clientSince >= board.seq) return { kind: 'synced', epoch: board.epoch, seq: board.seq }
  const first = board.ops[0]
  if (!first || first.seq > clientSince + 1) return { kind: 'full', board }
  return {
    kind: 'delta',
    epoch: board.epoch,
    seq: board.seq,
    ops: board.ops.filter((op) => op.seq > clientSince),
  }
}
