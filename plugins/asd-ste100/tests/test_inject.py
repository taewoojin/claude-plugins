"""inject.py가 받은 훅 이름을 되돌려 주고 rules.md를 additionalContext로 싣는지 잰다."""

import json
import os
import pathlib
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
RULES = (ROOT / "rules.md").read_text(encoding="utf-8")


def run(event):
    out = subprocess.run(
        [sys.executable, str(ROOT / "hooks" / "inject.py")],
        input=json.dumps({"hook_event_name": event}),
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)["hookSpecificOutput"]


class InjectTest(unittest.TestCase):
    def test_훅_이름마다_같은_이름으로_규칙_전문을_싣는다(self):
        for event in ("SessionStart", "SubagentStart"):
            out = run(event)
            self.assertEqual(out["hookEventName"], event)
            self.assertEqual(out["additionalContext"], RULES)

    def test_hooks_json의_명령이_두_훅에서_규칙_전문을_싣는다(self):
        hooks = json.loads((ROOT / "hooks" / "hooks.json").read_text())["hooks"]
        for event in ("SessionStart", "SubagentStart"):
            hook = hooks[event][0]["hooks"][0]
            self.assertEqual(hook["type"], "command")
            out = subprocess.run(
                hook["command"], shell=True, cwd="/",
                env={**os.environ, "CLAUDE_PLUGIN_ROOT": str(ROOT)},
                input=json.dumps({"hook_event_name": event}),
                capture_output=True, text=True, check=True,
            ).stdout
            self.assertEqual(json.loads(out)["hookSpecificOutput"]["additionalContext"], RULES)


if __name__ == "__main__":
    unittest.main()
