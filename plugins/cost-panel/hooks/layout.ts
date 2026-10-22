import type { CostView } from '../types'

// 숫자 칸은 폭을 고정하고, 이름 칸이 남는 폭을 다 가진다
const MARK = 2
const TIME = 11
const USD = 7
const COUNT = 7
const MIN_NAME = 10

export type Line = { text: string; isBold?: boolean; isDim?: boolean }

// 터미널에서 두 칸을 차지하는 글자(한글·한자·전각)
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

export function cellWidth(text: string): number {
  let width = 0
  for (const ch of text) width += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1
  return width
}

// 왼쪽 맞춤. 넘치면 끝을 「…」로 자른다
export function fitLeft(text: string, width: number): string {
  if (cellWidth(text) <= width) return text + ' '.repeat(width - cellWidth(text))
  let out = ''
  for (const ch of text) {
    if (cellWidth(out + ch) > width - 1) break
    out += ch
  }

  return out + '…' + ' '.repeat(width - 1 - cellWidth(out))
}

export function fitRight(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - cellWidth(text))) + text
}

// metrics.py의 half_up과 같다 — 0.5는 올린다
function halfUp(value: number, digits = 0): number {
  const scale = 10 ** digits

  return Math.floor(value * scale + 0.5) / scale
}

// metrics.py의 fmt_duration과 같은 표기
export function formatDuration(seconds: number): string {
  if (seconds < 60) return '1분 미만'
  const minutes = halfUp(seconds / 60)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}분`

  return m ? `${h}시간 ${m}분` : `${h}시간`
}

// metrics.py의 fmt_usd와 같은 표기. 가격표에 없는 모델만 쓴 몫은 「미상」
export function formatUsd(usd: number | null): string {
  if (usd === null) return '미상'
  const one = halfUp(usd, 1)

  return one >= 10 ? `$${halfUp(usd)}` : `$${one.toFixed(1)}`
}

export function layout(view: CostView, columns: number): Line[] {
  const cols = Math.max(MARK + MIN_NAME + USD, columns)
  const hasTime = cols - MARK - TIME - USD >= MIN_NAME
  const nameWidth = cols - MARK - (hasTime ? TIME : 0) - USD
  const row = (mark: string, name: string, seconds: number | null, usd: number | null) =>
    fitLeft(mark, MARK) +
    fitLeft(name, nameWidth) +
    (hasTime ? fitRight(seconds === null ? '' : formatDuration(seconds), TIME) : '') +
    fitRight(formatUsd(usd), USD)
  const lines: Line[] = []

  if (view.error) lines.push({ text: fitLeft(`  ${view.error}`, cols), isDim: true })
  if (!view.isLive) lines.push({ text: fitLeft(`  지난 세션 ${view.sessionId.slice(0, 8)}`, cols), isDim: true })
  if (view.rows.length === 0) lines.push({ text: fitLeft('  아직 띄운 에이전트가 없습니다', cols), isDim: true })
  for (const r of view.rows) {
    lines.push({ text: row(r.isRunning ? '▸' : '', r.label, r.seconds, r.usd), isBold: r.isRunning })
  }
  lines.push({ text: '─'.repeat(cols), isDim: true })
  lines.push({ text: row('', '메인', view.main.seconds, view.main.usd) })
  lines.push({ text: row('', '합계', null, view.total.usd), isBold: true })
  if (view.missing > 0) {
    lines.push({ text: fitLeft(`  기록이 없는 에이전트 ${view.missing}개는 뺐습니다`, cols), isDim: true })
  }

  if (view.kinds.length > 0) {
    const hasCount = cols - MARK - COUNT - USD >= MIN_NAME
    const kindWidth = cols - MARK - (hasCount ? COUNT : 0) - USD
    lines.push({ text: ' '.repeat(cols) })
    lines.push({ text: fitLeft('  종류별', cols), isDim: true })
    for (const k of view.kinds) {
      lines.push({
        text:
          ' '.repeat(MARK) +
          fitLeft(k.type, kindWidth) +
          (hasCount ? fitRight(`${k.count}개`, COUNT) : '') +
          fitRight(formatUsd(k.usd), USD),
      })
    }
  }
  lines.push({ text: fitRight('달러는 하한', cols), isDim: true })

  return lines
}
