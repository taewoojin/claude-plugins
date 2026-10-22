import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CostKind, CostRow, CostView } from '../types'
import { layout } from './layout'

const PANE = 'cost-panel'
const TITLE = '시간과 비용'
// `/cost`는 Claude Code에 이미 있는 `/usage`의 다른 이름이라 등록이 거절된다
const COMMAND = 'agent-cost'
const PYTHON = '/usr/bin/python3'
// 에이전트가 도는 동안 「몇 분째」가 올라가게 다시 재는 간격
const LIVE_MS = 15_000

const view = atom({ plugin: 'cost-panel', key: 'view' } as const, null)
const transcript = atom({ plugin: 'cost-panel', key: 'transcript' } as const, null)
const target = atom({ plugin: 'cost-panel', key: 'target' } as const, null)

type Agent = {
  agent: string
  name: string
  description?: string
  role: string
  start: number | null
  work_seconds: number
  usd: number | null
}
type Table = {
  agents: Agent[]
  main: { work_seconds: number; usd: number | null }
  total_usd: number
  missing: number
}

// 재는 중에 또 부르면 끝난 뒤 한 번 더 잰다 — 그 사이에 바뀐 대상(`/agent-cost <세션>`)을 놓치지 않게
let measuring: Promise<void> | null = null
let isStale = false

async function exists($: EngineInterface, path: string): Promise<boolean> {
  return (await $.fs.stat(path).catch(() => undefined)) !== undefined
}

async function configDir($: EngineInterface): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? ''}/.claude`
}

// 훅 입력이 오기 전에는 세션 id와 시작 폴더로 기록 파일 자리를 짐작한다
async function guessTranscript($: EngineInterface): Promise<string | null> {
  const root = (await $.session.root()).replace(/[^A-Za-z0-9]/g, '-')
  const path = `${await configDir($)}/projects/${root}/${await $.session.id()}.jsonl`

  return (await exists($, path)) ? path : null
}

// 셈은 플러그인에 함께 실은 측정 모듈(metrics/metrics.py)이 한다
async function findScript($: EngineInterface): Promise<string | null> {
  const path = `${$.plugin.root}/metrics/metrics.py`

  return (await exists($, path)) ? path : null
}

function sumUsd(values: (number | null)[]): number | null {
  const priced = values.filter((v): v is number => v !== null)

  return priced.length ? priced.reduce((a, b) => a + b, 0) : null
}

function toView(data: Table, sessionId: string, isLive: boolean, running: Map<string, string>): CostView {
  const rows: CostRow[] = data.agents
    .map(a => ({
      id: a.agent,
      label: a.description || running.get(a.agent) || a.name || a.role || a.agent,
      seconds: a.work_seconds,
      usd: a.usd,
      start: a.start ?? 0,
      isRunning: running.has(a.agent),
    }))
    .sort((x, y) => x.start - y.start)
  const byType = new Map<string, Agent[]>()
  for (const a of data.agents) {
    const type = a.role || a.name || '그 밖'
    byType.set(type, [...(byType.get(type) ?? []), a])
  }
  const kinds: CostKind[] = [...byType]
    .map(([type, list]) => ({ type, count: list.length, usd: sumUsd(list.map(a => a.usd)) }))
    .sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0))

  return {
    sessionId,
    isLive,
    rows,
    main: { seconds: data.main.work_seconds, usd: data.main.usd },
    total: { usd: data.total_usd },
    kinds,
    missing: data.missing,
  }
}

function emptyView(sessionId: string, isLive: boolean, error?: string): CostView {
  return {
    sessionId,
    isLive,
    rows: [],
    main: { seconds: 0, usd: null },
    total: { usd: null },
    kinds: [],
    missing: 0,
    error,
  }
}

function refresh($: EngineInterface): Promise<void> {
  if (measuring !== null) {
    isStale = true
    return measuring
  }
  measuring = (async () => {
    do {
      isStale = false
      await measure($)
    } while (isStale)
  })().finally(() => {
    measuring = null
  })

  return measuring
}

async function measure($: EngineInterface): Promise<void> {
  try {
    const other = await read($, target)
    const path = other ?? (await read($, transcript)) ?? (await guessTranscript($))
    const sessionId = (path ?? '').split('/').pop()?.replace(/\.jsonl$/, '') ?? ''
    const isLive = other === null
    if (path === null) {
      await update($, view, () => emptyView(sessionId, isLive))
      return
    }
    const script = await findScript($)
    if (script === null) {
      await update($, view, () => emptyView(sessionId, isLive, '측정 모듈(metrics.py)을 찾지 못했습니다'))
      return
    }
    const ran = await $.process.run([PYTHON, script, 'table', path, '--json'], { timeoutMs: 20_000 })
    if (ran.exitCode !== 0) {
      // 첫 메시지 전에는 이 세션의 기록 파일이 아직 없다 — 빈 목록으로 둔다
      const error = isLive ? undefined : ran.stderr.trim().split('\n')[0]
      await update($, view, () => emptyView(sessionId, isLive, error))
      return
    }
    const agents = isLive ? await $.agent.list() : []
    const running = new Map(agents.filter(a => a.status === 'running').map(a => [a.id, a.description]))
    const next = toView(JSON.parse(ran.stdout) as Table, sessionId, isLive, running)
    await update($, view, () => next)
  } catch (err) {
    await update($, view, current => ({
      ...(current ?? emptyView('', true)),
      error: `다시 재지 못했습니다: ${err instanceof Error ? err.message : String(err)}`,
    }))
  }
}

// 고전 훅 입력이 실어 오는 메인 기록 파일 경로를 받아 둔다. /clear 뒤에는 새 경로가 온다
async function keepTranscript($: EngineInterface, path: string | undefined): Promise<void> {
  if (!path) return
  const before = await read($, transcript)
  if (before === path) return
  await update($, transcript, () => path)
  if (before !== null) await update($, target, () => null)
}

async function findSession($: EngineInterface, id: string): Promise<string | null> {
  const ran = await $.process.run(['/usr/bin/find', `${await configDir($)}/projects`, '-maxdepth', '2', '-name', `${id}*.jsonl`])
  const found = ran.stdout.split('\n').filter(Boolean)

  return found.length === 1 ? (found[0] ?? null) : null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: '이 세션(또는 지난 세션)의 에이전트마다 일한 시간과 비용을 옆 패널에 보인다',
      argumentHint: '[세션 id]',
    })
    void $.ui.open({ id: PANE, title: TITLE, columns: 40 })
    $.clock.every(LIVE_MS, () => {
      void (async () => {
        if ((await read($, target)) !== null) return
        if ((await $.agent.list()).some(a => a.status === 'running')) await refresh($)
      })()
    })
    await refresh($)

    return next(e)
  })

  // 서브에이전트 안에서 난 이벤트(agent_id가 있다)는 그 에이전트의 기록 경로를 실어 온다
  on('classic.SessionStart', async ($, e, next) => {
    const done = await next(e)
    if (e.agent_id === undefined) await keepTranscript($, e.transcript_path)
    await refresh($)

    return done
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    const done = await next(e)
    if (e.agent_id === undefined) await keepTranscript($, e.transcript_path)
    await refresh($)

    return done
  })

  on('classic.Stop', async ($, e, next) => {
    const done = await next(e)
    if (e.agent_id === undefined) await keepTranscript($, e.transcript_path)
    await refresh($)

    return done
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const done = await next(e)
    await keepTranscript($, e.transcript_path)
    await refresh($)

    return done
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await refresh($)

    return done
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const id = e.args.trim()
    if (id === '') {
      await update($, target, () => null)
    } else {
      const path = await findSession($, id)
      if (path === null) return { text: `세션 ${id}의 기록을 찾지 못했습니다(없거나, 앞자리가 겹치는 세션이 여럿입니다)` }
      await update($, target, () => path)
    }
    await $.ui.open({ id: PANE, title: TITLE, columns: 40 })
    await refresh($)

    return { text: id === '' ? '이 세션을 옆 패널에 띄웠습니다' : `지난 세션 ${id}을 옆 패널에 띄웠습니다` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current = await read($, view)
    if (current === null) return <Text dimColor>재는 중…</Text>
    const lines = layout(current, e.props.bodyColumns)

    return (
      <Box flexDirection="column">
        {lines.map(line => (
          <Text wrap="truncate" bold={line.isBold} dimColor={line.isDim}>
            {line.text}
          </Text>
        ))}
      </Box>
    )
  })
}
