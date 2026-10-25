# claude-plugins

Claude Code에서 쓰는 개인 플러그인 모음이다.

## 플러그인

### cost-panel

채팅 옆 패널에 이 세션에서 띄운 에이전트를 띄운 순서대로 한 줄씩 보인다. 줄마다 띄울 때 붙인 설명, 일한 시간, 달러가 나온다. 아래에는 메인 몫, 합계, 에이전트 종류별 합계가 붙는다. 도는 중인 에이전트는 `▸`로 표시하고, 도는 동안 15초마다 다시 잰다.

- `/agent-cost` — 이 세션을 패널에 띄운다
- `/agent-cost <세션 id 앞자리>` — 지난 세션을 같은 모양으로 띄운다
- `/clear` 뒤에는 새 세션부터 다시 센다

달러는 하한이다. 가격표에 없는 모델의 몫은 「미상」으로 둔다. 셈은 함께 실은 `metrics/metrics.py`가 세션 기록 파일(`~/.claude/projects/…`)을 읽어서 한다. 맥의 `/usr/bin/python3`이 필요하다.

### asd-ste100

읽는 사람에 따라 문서의 언어를 가른다. 사람이 읽는 것(질문·보고·스펙·커밋·PR·화면 문구)은 사용자 언어로, 에이전트끼리만 읽는 것(서브에이전트 지시문과 그 보고·플랜·케이스 목록)은 ASD-STE100(Simplified Technical English)으로 쓴다. 에이전트 문서는 짧은 능동태 문장과 한 용어에 한 뜻으로 써서 오해와 모호함을 줄인다. 작업마다 용어표(`glossary.md`)를 두고 그 표의 용어만 쓴다.

- 규칙 본문은 `rules.md` 하나다. `SessionStart` 훅이 메인 세션에, `SubagentStart` 훅이 서브에이전트마다 넣는다.
- 프로젝트 지침이나 에이전트 정의가 어떤 글의 언어를 따로 정하면 그쪽이 이기고, 충돌로 알리지 않는다. 그래서 「보고는 한글로」·「한국어로 쓴다」 같은 줄이 남은 에이전트는 조용히 STE에서 빠진다. 그 에이전트도 STE로 쓰게 하려면 설치한 뒤 그 줄을 지운다. 「모든 기록은 ○○어로」처럼 전체를 덮는 줄은 이기지 못하고 에이전트가 충돌로 알린다. 설치한 뒤 사람이 읽는 기록으로 좁혀 둔다.
- 다른 문서 언어 규칙의 플러그인과 함께 켜지 않는다. 함께 켜지면 에이전트가 충돌을 알린다.
- `python3`가 필요하다. 테스트는 `python3 -m unittest discover -s plugins/asd-ste100/tests`다.
- 사용자 범위가 아니라 **프로젝트 범위**로 켠다. 프로젝트마다 지침의 언어 줄을 맞춘 뒤에 켜야 해서다. 프로젝트의 `.claude/settings.json`에 `enabledPlugins`와 `extraKnownMarketplaces`를 넣으면 된다.

## 설치

Claude Code 터미널 프롬프트에서:

```
/plugin install <플러그인 이름> --marketplace taewoojin/claude-plugins
```

셸에서:

```
claude plugin install <플러그인 이름> --marketplace taewoojin/claude-plugins
```

「Add marketplace?」에는 `y`로 답하고, 범위는 사용자(user)를 고른다. asd-ste100만은 프로젝트(project) 범위를 고른다.

데스크톱 앱에서는 프롬프트 옆 + → Plugins → Add marketplace에 `taewoojin/claude-plugins`를 넣고 Add plugin으로 설치한다.
