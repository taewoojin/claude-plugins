import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { CostView } from '../types'
import { cellWidth, layout } from '../hooks/layout'

const VIEW: CostView = {
  sessionId: 'e51d7d86-9d5a-4155-b7bc-8b6c5112db3d',
  isLive: true,
  rows: [
    { id: 'a1', label: '스펙 검증', seconds: 360, usd: 2.3, start: 1, isRunning: false },
    { id: 'a2', label: '구현 감사 5회차 — 좁힌 확인', seconds: 8280, usd: 14.04, start: 2, isRunning: true },
  ],
  main: { seconds: 3840, usd: 14 },
  total: { usd: 43 },
  kinds: [{ type: 'implementation-auditor', count: 5, usd: 4.6 }],
  missing: 0,
}

const PANE = {
  plugin: 'cost-panel',
  component: 'Pane',
  requestId: 'cost-panel',
  props: {
    title: '시간과 비용',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('이름 칸은 진행 중 표시가 있든 없든 같은 자리에서 시작하고, 숫자는 오른쪽 끝에 맞는다', async () => {
  for (const columns of [40, 56, 80]) {
    const lines = layout(VIEW, columns)
    const done = lines.find(l => l.text.includes('스펙 검증'))
    const running = lines.find(l => l.text.includes('구현 감사'))

    expect(done?.text.startsWith('  스펙')).toBe(true)
    expect(running?.text.startsWith('▸ 구현')).toBe(true)
    expect(running?.isBold).toBe(true)
    for (const line of lines) expect(cellWidth(line.text)).toBe(columns)
    expect(done?.text.endsWith('  $2.3')).toBe(true)
    expect(running?.text.endsWith('    $14')).toBe(true)
  }
})

test('패널이 넓어지면 이름 칸이 늘고, 좁아 이름이 10칸 아래로 줄면 시간 칸을 뺀다', async () => {
  const wide = layout(VIEW, 80).find(l => l.text.includes('구현 감사'))
  expect(wide?.text.includes('2시간 18분')).toBe(true)
  expect(wide?.text.includes('…')).toBe(false)

  const narrow = layout(VIEW, 40).find(l => l.text.includes('구현 감사'))
  expect(narrow?.text.includes('2시간 18분')).toBe(true)
  expect(narrow?.text.includes('…')).toBe(true)

  // 2 + 이름 9 + 시간 11 + 비용 7 = 29: 시간 칸을 두면 이름이 10칸이 안 된다
  const tiny = layout(VIEW, 29).find(l => l.text.includes('스펙'))
  expect(tiny?.text.includes('6분')).toBe(false)
  expect(tiny?.text.endsWith('$2.3')).toBe(true)
})

test('아래 칸은 메인·합계·종류별·하한 순서다', async () => {
  const texts = layout(VIEW, 40).map(l => l.text.trim())
  const at = (word: string) => texts.findIndex(t => t.includes(word))

  expect(at('메인') > at('구현 감사')).toBe(true)
  expect(at('합계')).toBe(at('메인') + 1)
  expect(at('종류별') > at('합계')).toBe(true)
  expect(texts[texts.length - 1]).toBe('달러는 하한')
})

const TABLE = {
  agents: [
    { agent: 'a1', name: 'spec-verifier', description: '스펙 검증', role: 'spec-verifier', start: 10, work_seconds: 360, usd: 2.3 },
    { agent: 'a2', name: 'qa', description: '', role: 'qa', start: 20, work_seconds: 780, usd: 2.5 },
  ],
  main: { work_seconds: 3840, usd: 14 },
  total_usd: 18.8,
  total_seconds: 88_799,
  missing: 0,
}
const HERE = '/home/me/.claude/projects/-work-repo/sess-1.jsonl'
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

type Ran = string[][] & { opens: () => number; store: Map<string, unknown> }

// 엔진 자리를 채운다. 돌린 명령을 모아 돌려준다. `opens`는 패널을 연 횟수, `store`는 세션을 넘어 남는 값이다
function engine(on: On, isAgentRunning = true, store: Record<string, unknown> = {}): Ran {
  const ran = [] as unknown as Ran
  let isOpen = false
  let opens = 0
  ran.opens = () => opens
  ran.store = new Map(Object.entries(store))
  on('store.get', (_, e) => ({ value: ran.store.get(e.key) }))
  on('store.set', (_, e) => {
    ran.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', () => {
    isOpen = true
    opens += 1
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: isOpen ? [{ id: 'cost-panel', title: '시간과 비용', isShown: true, isFocused: false, isPlaced: true }] : [],
  }))
  on('ui.close', () => {
    isOpen = false
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.root', () => ({ value: '/work/repo' }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('agent.list', () => ({
    value: isAgentRunning ? [{ id: 'a2', description: '수용 테스트', type: 'qa', status: 'running', name: 'qa' }] : [],
  }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    const stdout = e.argv[0] === '/usr/bin/find' ? '/home/me/.claude/projects/-other/old-2.jsonl\n' : JSON.stringify(TABLE)

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return ran
}

const measured = (ran: string[][]) => ran.filter(argv => argv[2] === 'table').map(argv => argv[3])

test('/agent-cost를 치면 이 세션의 기록을 재서 옆 패널에 그린다', async ($, on) => {
  mock.clock(on)
  const ran = engine(on, true, { isOn: false })

  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  const { text } = await $.command.run({ command: 'agent-cost', args: '', ...RUN })
  expect(text).toBe('이 세션을 옆 패널에 띄웠습니다')
  expect(ran.at(-1)?.slice(2)).toEqual(['table', HERE, '--json'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /스펙 검증/ }))?.text.startsWith('  스펙 검증')).toBe(true)
    // 설명이 빈 에이전트는 도는 에이전트 목록의 설명으로 이름을 붙인다
    expect((await ui.find({ type: 'Text', text: /수용 테스트/ }))?.text.startsWith('▸ 수용 테스트')).toBe(true)
    await ui.unmount()
  }
})

test('에이전트가 도는 동안에만 15초마다 다시 잰다', async ($, on) => {
  const clock = mock.clock(on)
  const ran = engine(on)
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  const before = measured(ran).length

  await clock.advance(15_000)
  expect(measured(ran).length).toBe(before + 1)
})

test('아무 에이전트도 돌지 않으면 타이머가 다시 재지 않는다', async ($, on) => {
  const clock = mock.clock(on)
  const ran = engine(on, false)
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  const before = measured(ran).length

  await clock.advance(45_000)
  expect(measured(ran).length).toBe(before)
})

test('지난 세션을 띄운 뒤 /clear로 새 세션이 시작되면 다시 이 세션을 본다', async ($, on) => {
  mock.clock(on)
  const ran = engine(on)
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  await $.classic.UserPromptSubmit({ prompt: '안녕', transcript_path: HERE })

  await $.command.run({ command: 'agent-cost', args: 'old-2', ...RUN })
  expect(measured(ran).at(-1)).toBe('/home/me/.claude/projects/-other/old-2.jsonl')

  await $.classic.SessionStart({ source: 'clear', transcript_path: '/home/me/.claude/projects/-work-repo/sess-3.jsonl' })
  expect(measured(ran).at(-1)).toBe('/home/me/.claude/projects/-work-repo/sess-3.jsonl')
})

test('합계 줄은 달러만 낸다 — 세션의 처음과 끝 사이 시간은 쉰 시간까지 담는다', async () => {
  const total = layout(VIEW, 40).find(l => l.text.includes('합계'))
  expect(total?.text).toBe(`  합계${' '.repeat(16)}${' '.repeat(11)}    $43`)
})

test('/agent-cost를 다시 치면 패널을 닫고, 다음 세션도 닫힌 채로 시작한다', async ($, on) => {
  mock.clock(on)
  const ran = engine(on)
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  expect(ran.opens()).toBe(1)

  const { text } = await $.command.run({ command: 'agent-cost', args: '', ...RUN })
  expect(text?.startsWith('패널을 닫았습니다')).toBe(true)
  expect(ran.store.get('isOn')).toBe(false)

  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  expect(ran.opens()).toBe(1)

  await $.command.run({ command: 'agent-cost', args: '', ...RUN })
  expect(ran.opens()).toBe(2)
  expect(ran.store.get('isOn')).toBe(true)
})

test('꺼져 있는 동안에는 이벤트가 와도 재지 않는다', async ($, on) => {
  const clock = mock.clock(on)
  const ran = engine(on, true, { isOn: false })
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  await $.classic.UserPromptSubmit({ prompt: '안녕', transcript_path: HERE })
  await clock.advance(30_000)

  expect(ran.opens()).toBe(0)
  expect(measured(ran).length).toBe(0)
})

test('지난 세션을 보던 중 /agent-cost를 치면 닫지 않고 이 세션으로 돌아온다', async ($, on) => {
  mock.clock(on)
  const ran = engine(on)
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'agent-cost', args: 'old-2', ...RUN })

  const { text } = await $.command.run({ command: 'agent-cost', args: '', ...RUN })
  expect(text).toBe('이 세션을 옆 패널에 띄웠습니다')
  expect(measured(ran).at(-1)).toBe(HERE)
})

