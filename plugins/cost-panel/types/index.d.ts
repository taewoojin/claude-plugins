// 에이전트 한 번 띄운 몫: 띄울 때 붙인 설명, 일한 시간(초), 달러(가격표에 없으면 null)
export type CostRow = {
  id: string
  label: string
  seconds: number
  usd: number | null
  start: number
  isRunning: boolean
}

// 에이전트 종류(정의 이름)마다의 합
export type CostKind = { type: string; count: number; usd: number | null }

export type CostView = {
  sessionId: string
  isLive: boolean
  rows: CostRow[]
  main: { seconds: number; usd: number | null }
  // 합계는 달러만 낸다. 에이전트는 메인과 겹쳐 돌아 시간은 더할 수 없고, 세션의 처음과 끝 사이는 쉰 시간까지 담는다
  total: { usd: number | null }
  kinds: CostKind[]
  missing: number
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'cost-panel': {
      view: CostView | null
      // 이 세션의 메인 기록 파일
      transcript: string | null
      // `/cost <세션>`으로 띄운 다른 세션의 기록 파일. null이면 이 세션을 본다
      target: string | null
    }
  }
}
