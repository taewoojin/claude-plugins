"""SessionStart·SubagentStart 훅 — rules.md를 메인 세션과 서브에이전트의 맥락 맨 앞에 넣는다."""

import json
import pathlib
import sys

RULES = pathlib.Path(__file__).resolve().parent.parent / "rules.md"

event = json.load(sys.stdin).get("hook_event_name", "SessionStart")
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": event,
        "additionalContext": RULES.read_text(encoding="utf-8"),
    }
}, ensure_ascii=False))
