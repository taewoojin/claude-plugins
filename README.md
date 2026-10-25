# claude-plugins

Claude Code에서 쓰는 개인 플러그인 모음이다.

## 플러그인

### cost-panel

채팅 옆 패널에 이 세션에서 띄운 에이전트를 띄운 순서대로 한 줄씩 보인다. 줄마다 띄울 때 붙인 설명, 일한 시간, 달러가 나온다. 아래에는 메인 몫, 합계, 에이전트 종류별 합계가 붙는다. 도는 중인 에이전트는 `▸`로 표시하고, 도는 동안 15초마다 다시 잰다.

- `/agent-cost` — 패널을 켜고 끈다. 지난 세션을 보던 중이면 이 세션으로 돌아온다
- `/agent-cost <세션 id 앞자리>` — 지난 세션을 같은 모양으로 띄운다
- 마지막에 켰는지 껐는지 기억한다 — 끄면(패널을 직접 닫아도) 다음 세션도 닫힌 채로 시작하고, 켜면 다음 세션도 열린 채로 시작한다. 처음 설치하면 켜져 있다. 꺼져 있는 동안에는 재지 않는다
- `/clear` 뒤에는 새 세션부터 다시 센다

달러는 하한이다. 가격표에 없는 모델의 몫은 「미상」으로 둔다. 셈은 함께 실은 `metrics/metrics.py`가 세션 기록 파일(`~/.claude/projects/…`)을 읽어서 한다. 맥의 `/usr/bin/python3`이 필요하다.

## 설치

Claude Code 터미널 프롬프트에서:

```
/plugin install cost-panel --marketplace taewoojin/claude-plugins
```

셸에서:

```
claude plugin install cost-panel --marketplace taewoojin/claude-plugins
```

새 판으로 올리려면 셸에서 마켓플레이스 목록을 새로 받은 뒤 플러그인을 올리고, 새 세션을 연다.

```
claude plugin marketplace update taewoojin
claude plugin update cost-panel
```

「Add marketplace?」에는 `y`로 답하고, 범위는 사용자(user)를 고른다.

데스크톱 앱에서는 프롬프트 옆 + → Plugins → Add marketplace에 `taewoojin/claude-plugins`를 넣고 Add plugin으로 설치한다.
