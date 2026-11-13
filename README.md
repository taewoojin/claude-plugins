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

### asd-ste100

읽는 사람에 따라 문서의 언어를 가른다. 사람이 읽는 것(질문·보고·스펙·커밋·PR·화면 문구)은 사용자 언어로, 에이전트끼리만 읽는 것(서브에이전트 지시문과 그 보고·플랜·케이스 목록)은 ASD-STE100(Simplified Technical English)으로 쓴다. 에이전트 문서는 짧은 능동태 문장과 한 용어에 한 뜻으로 써서 오해와 모호함을 줄인다. 작업마다 용어표(`glossary.md`)를 두고 그 표의 용어만 쓴다.

- 규칙 본문은 `rules.md` 하나다. `SessionStart` 훅이 메인 세션에, `SubagentStart` 훅이 서브에이전트마다 넣는다.
- 프로젝트 지침이나 에이전트 정의가 어떤 글의 언어를 따로 정하면 그쪽이 이기고, 충돌로 알리지 않는다. 그래서 「보고는 한글로」·「한국어로 쓴다」 같은 줄이 남은 에이전트는 조용히 STE에서 빠진다. 그 에이전트도 STE로 쓰게 하려면 설치한 뒤 그 줄을 지운다. 「모든 기록은 ○○어로」처럼 전체를 덮는 줄은 이기지 못하고 에이전트가 충돌로 알린다. 설치한 뒤 사람이 읽는 기록으로 좁혀 둔다.
- 다른 문서 언어 규칙의 플러그인과 함께 켜지 않는다. 함께 켜지면 에이전트가 충돌을 알린다.
- `python3`가 필요하다. 테스트는 `python3 -m unittest discover -s plugins/asd-ste100/tests`다.
- 사용자 범위가 아니라 **프로젝트 범위**로 켠다. 프로젝트마다 지침의 언어 줄을 맞춘 뒤에 켜야 해서다. 프로젝트의 `.claude/settings.json`에 `enabledPlugins`와 `extraKnownMarketplaces`를 넣으면 된다.

### worktrees

어느 프로젝트에서나 같은 절차로 작업용 워크트리를 만들고 지우게 한다. 프로젝트마다 다른 값(워크트리를 둘 자리, 설치 명령, 복사할 파일)은 그 프로젝트가 커밋한 파일에 두고, 플러그인은 그 파일을 읽는다.

- `worktree` 스킬: 워크트리를 만들고, 쓰고, 지우는 절차. 코드를 바꾸기 전에 메인 작업 폴더가 아닌 새 워크트리와 브랜치에서 일하게 한다. Paseo가 있으면 Paseo로 워크스페이스를 만들고 그 안에 작업 에이전트를 띄운다. 그래서 작업이 사이드바의 그 워크스페이스 탭으로 보이고, 지금 세션은 지휘만 한다. Paseo가 없으면 `git worktree`로 만들고 지금 세션이 그 안에서 일한다
- `worktree-setup` 스킬: 프로젝트 하나를 설정한다. 코드를 먼저 읽어 설치 명령·복사할 파일·워크트리를 제외해야 하는 도구를 찾고, 코드로 알 수 없는 워크트리 자리만 묻는다. 바뀔 파일을 표로 보인 뒤 승인받아 적용한다
- `.worktrees.json`: 저장소 루트에 커밋하는 파일이다. `{ "location": "inside" }`처럼 자리를 정한다. 값은 `inside`(`<메인 작업 폴더>/.worktrees/<슬러그>`), `sibling`(`<메인 작업 폴더>-<슬러그>`), `paseo`(Paseo 기본 경로)다. 슬러그는 브랜치 이름의 `/`를 `-`로 바꾼 것이다. 설치 명령은 `paseo.json`의 `worktree.setup`, 복사할 파일은 `.worktreeinclude`에 둔다
- Paseo 자리 플러그인 `worktree-placement`: Paseo가 워크트리를 만들 때마다 그 저장소의 `.worktrees.json`을 읽어 경로를 정한다. 파일이 없거나 깨졌으면 Paseo 기본 경로를 쓴다. `inside`는 git이 `.worktrees/`를 무시할 때만 쓴다. 기계마다 한 번 설치한다. `worktree-setup`이 안내하지만 직접 하려면 Paseo의 플러그인을 켠 뒤 셸에서 `paseo plugin install git:taewoojin/claude-plugins:plugins/worktrees/paseo/worktree-placement`를 실행한다. Git에서 받으므로 이 저장소의 기본 브랜치에 올라간 뒤부터 설치된다
- 플러그인은 사용자 범위로 켜도 되고 프로젝트 범위로 켜도 된다. 프로젝트마다 다른 값은 범위와 상관없이 그 프로젝트의 `.worktrees.json`에서 읽는다

## 설치

Claude Code 터미널 프롬프트에서:

```
/plugin install <플러그인 이름> --marketplace taewoojin/claude-plugins
```

셸에서:

```
claude plugin install <플러그인 이름> --marketplace taewoojin/claude-plugins
```

새 판으로 올리려면 셸에서 마켓플레이스 목록을 새로 받은 뒤 플러그인을 올리고, 새 세션을 연다.

```
claude plugin marketplace update taewoojin
claude plugin update <플러그인 이름>
```

「Add marketplace?」에는 `y`로 답하고, 범위는 사용자(user)를 고른다. asd-ste100만은 프로젝트(project) 범위를 고른다. worktrees는 어느 쪽이든 된다.

데스크톱 앱에서는 프롬프트 옆 + → Plugins → Add marketplace에 `taewoojin/claude-plugins`를 넣고 Add plugin으로 설치한다.
