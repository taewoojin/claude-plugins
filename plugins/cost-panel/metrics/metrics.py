#!/usr/bin/env python3
"""세션 기록에서 에이전트마다 일한 시간과 토큰(달러 환산)을 잰다. cost-panel 패널이 부른다.

명령
  table <메인 세션 기록 파일> [--json]
      그 세션과 `<세션 폴더>/subagents/`의 에이전트 기록을 에이전트·단계마다 표로 낸다.
      `--json`은 같은 값을 반올림 없이 내고, 에이전트 줄에 띄울 때 붙인 설명(`description`)과 그 기록 파일에 적힌
      순서로 첫 줄·끝 줄 시각(`start`·`end`, epoch 초)을 더한다.

세션 기록 찾기 — 메인 세션의 기록은 `~/.claude/projects/<작업 폴더 경로의 /를 -로 바꾼 이름>/<세션 id>.jsonl`이다.

재는 법
  - 메시지는 `message.id`로 묶고, 토큰은 같은 id의 줄들에서 종류마다 가장 큰 값을 쓴다. `<synthetic>`은 세지 않는다.
  - 일한 구간은 지시 줄(메타도 도구 결과도 아닌 사용자 줄)에서 시작해 다음 지시 줄 바로 앞의 마지막 메시지·도구 결과
    줄에서 끝난다. `AskUserQuestion`의 호출~결과와, 메인 기록에서는 `Agent`의 호출~결과를 뺀다.
  - 조각은 회차를 여는 지시(첫 지시, 그리고 plan-writer·spec-verifier가 team-lead에게서 받은 지시)에 딸린 구간들이다.
  - 달러는 하한이다 — 에이전트 기록의 출력 토큰은 이른 스냅숏으로 남아 덜 잡히고, 글자 수로 채우지 않는다.
"""
import glob
import json
import math
import os
import re
import sys
from datetime import datetime, timezone


# 100만 토큰당 달러 — 새 입력, 캐시 쓰기 5분, 캐시 쓰기 1시간, 캐시 읽기, 출력.
# Anthropic Claude API 공개가, 기준일 2026-10-06. 캐시 쓰기 5분은 입력의 1.25배, 1시간은 2배.
PRICES = {
    "claude-opus-5-5": (4, 5, 8, 0.20, 20),
    "claude-opus-5": (5, 6.25, 10, 0.50, 25),
    "claude-sonnet-5-5": (2, 2.5, 4, 0.20, 10),
    "claude-haiku-5-5": (0.10, 0.125, 0.20, 0.01, 0.50),
    "claude-fable-5-1": (10, 12.5, 20, 0.25, 50),
}
KINDS = ("input", "cache_write_5m", "cache_write_1h", "cache_read", "output")

ROLES = {
    "spec-verifier": "spec", "ux-writer": "spec",
    "plan-writer": "plan-writing", "plan-auditor": "plan-audit",
    "implementer": "implementation",
    "qa": "acceptance",
    "implementation-auditor": "implementation-audit",
}
STAGES = (("spec", "스펙 검증"), ("plan-writing", "플랜 작성"), ("plan-audit", "플랜 감사"), ("implementation", "구현"),
          ("acceptance", "수용 테스트"), ("implementation-audit", "구현 감사"), ("main", "메인"), ("other", "그 밖"))
# 회차 `(N회)`를 붙이는 단계 — 감사는 회차마다 새로 띄우므로 조각 수가 띄운 감사의 수다
AUDIT_STAGES = {"plan-audit", "implementation-audit"}
# 계속 살아 있어 다시 맡길 때마다 회차를 여는 역할
PERSISTENT = {"plan-writer", "spec-verifier"}
LEAD_PREFIX = '<teammate-message teammate_id="team-lead"'
# 줄 머리의 「작업 디렉터리:」만 잡는다 — 본문 문장 속의 같은 글귀를 경로로 옮기지 않는다
WORKTREE = re.compile(r"^[ \t]*작업 디렉터리:[ \t]*([^\n]+)", re.M)


# ---------------------------------------------------------------- 기록 읽기


def parse_ts(s):
    """ISO 시각을 epoch 초로. 3.9의 fromisoformat은 끝의 Z를 읽지 못한다."""
    if not isinstance(s, str):
        return None
    try:
        dt = datetime.fromisoformat(s[:-1] + "+00:00" if s.endswith("Z") else s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()



def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
    return ""


def entry(d, ts):
    """기록 한 줄에서 재는 데 쓰는 것만 꺼낸다. kind: msg · result · directive · other(기록용 줄)."""
    e = {"t": d["timestamp"], "ts": ts, "kind": "other", "uuid": d.get("uuid"), "cwd": d.get("cwd")}
    m = d.get("message") if isinstance(d.get("message"), dict) else {}
    content = m.get("content")
    if d.get("type") == "assistant" and m.get("id"):
        if m.get("model") == "<synthetic>":
            return e
        e.update(kind="msg", mid=m["id"], model=m.get("model") or "", usage=m.get("usage") or {},
                 stop=m.get("stop_reason"),
                 tools=[(c.get("id"), c.get("name"), c.get("input") or {}) for c in content or ()
                        if isinstance(c, dict) and c.get("type") == "tool_use"])
    elif d.get("type") == "user":
        ids = [c.get("tool_use_id") for c in content if isinstance(c, dict) and c.get("type") == "tool_result"] \
            if isinstance(content, list) else []
        if ids:
            e.update(kind="result", ids=ids, tur=d.get("toolUseResult"))
        elif not d.get("isMeta"):
            e.update(kind="directive", text=text_of(content))
    return e


def load(path):
    """기록 파일을 읽어 (항목 목록, sessionId가 있는 줄이 있었는가)를 낸다. 깨진 줄은 건너뛴다."""
    out, has_session = [], False
    with open(path, encoding="utf-8", errors="replace") as f:
        for raw in f:
            try:
                d = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(d, dict):
                continue
            has_session = has_session or bool(d.get("sessionId"))
            ts = parse_ts(d.get("timestamp"))
            if ts is not None:
                out.append(entry(d, ts))
    return out, has_session


# ---------------------------------------------------------------- 역할과 단계, 가격


def normalize_role(raw):
    """표의 이름과 같거나 「이름-」으로 시작하면 표 이름으로 맞춘다(붙인 이름 `ux-writer-timeline-removal` → `ux-writer`)."""
    for r in sorted(ROLES, key=len, reverse=True):
        if raw == r or raw.startswith(r + "-"):
            return r
    return raw


def role_of(meta, hook_type=None):
    return normalize_role(meta.get("customAgentType") or meta.get("agentType") or hook_type or "")


def stage_of(role):
    return "main" if role == "main" else ROLES.get(role, "other")


def model_name(model):
    model = model[:-4] if model.endswith("[1m]") else model
    return re.sub(r"-\d{8}$", "", model)


def price(tokens):
    """(값이 있는 모델의 달러 합 — 하나도 없으면 None, 가격 미상 모델 목록)."""
    usd, priced, unpriced = 0.0, False, []
    for model, t in sorted(tokens.items()):
        p = PRICES.get(model)
        if p is None:
            if any(t.values()):
                unpriced.append(model)
            continue
        priced = True
        usd += sum(t[k] * p[i] for i, k in enumerate(KINDS)) / 1_000_000
    return (usd if priced or not unpriced else None), unpriced


def has_priced(tokens):
    return any(model in PRICES for model in tokens)


def add_tokens(into, tokens):
    for model, t in tokens.items():
        dst = into.setdefault(model, dict.fromkeys(KINDS, 0))
        for k in KINDS:
            dst[k] += t.get(k, 0)
    return into


# ---------------------------------------------------------------- 지시 단위로 재기


def is_protocol(text):
    """team-lead가 보낸 규약 JSON(종료 요청 등)인가."""
    body = text.split(">", 1)[1] if ">" in text else ""
    body = body.strip()
    return body.startswith("{") and re.search(r'"type"\s*:', body) is not None


def opens_round(e, role):
    text = e["text"]
    return role in PERSISTENT and text.startswith(LEAD_PREFIX) and not is_protocol(text)


def worktree_in(text):
    m = WORKTREE.search(text or "")
    return m.group(1).strip().strip("`").rstrip("/") if m else None


def usage_tokens(u):
    split = u.get("cache_creation")
    if isinstance(split, dict):
        w5, w1h = split.get("ephemeral_5m_input_tokens") or 0, split.get("ephemeral_1h_input_tokens") or 0
    else:
        # 나눔이 없으면 싼 쪽(5분)으로 잡는다 — 덜 세지 언정 지어내지 않는다
        w5, w1h = u.get("cache_creation_input_tokens") or 0, 0
    return {"input": u.get("input_tokens") or 0, "cache_write_5m": w5, "cache_write_1h": w1h,
            "cache_read": u.get("cache_read_input_tokens") or 0, "output": u.get("output_tokens") or 0}


def piece_stats(es, waits):
    """한 조각의 소비한 항목들에서 구간·시간·메시지·토큰을 낸다."""
    intervals, cur, waiting, msgs, seen = [], None, set(), {}, []
    for e in es:
        k = e["kind"]
        if k == "other":
            continue
        seen.append(e)
        if k == "directive":
            if cur:
                intervals.append(cur)
            cur = [e, e]
            continue
        if k == "result":
            # 한 메시지로 함께 부른 것은 결과가 따로 온다 — 기다리는 것이 다 돌아와야 구간을 다시 연다
            if waiting:
                waiting -= set(e["ids"])
                if waiting:
                    continue
        if cur:
            cur[1] = e
        else:
            cur = [e, e]
        if k == "msg":
            m = msgs.setdefault(e["mid"], {"model": model_name(e["model"]), **dict.fromkeys(KINDS, 0)})
            for kind, v in usage_tokens(e["usage"]).items():
                m[kind] = max(m[kind], v)
            w = {tid for tid, name, _ in e["tools"] if name in waits}
            if w:
                waiting |= w
                intervals.append(cur)
                cur = None
    if cur:
        intervals.append(cur)
    tokens = {}
    for m in msgs.values():
        add_tokens(tokens, {m["model"]: {k: m[k] for k in KINDS}})
    return {
        "start": seen[0]["t"] if seen else None,
        "end": seen[-1]["t"] if seen else None,
        "intervals": [[a["t"], b["t"]] for a, b in intervals],
        "work_seconds": sum(b["ts"] - a["ts"] for a, b in intervals),
        "messages": len(msgs),
        "tokens": tokens,
        "directives": sum(1 for e in seen if e["kind"] == "directive"),
    }


def measure(entries, role, main=False, cursor=None, floor=None, upto=None):
    """기록을 조각으로 나눠 조각마다의 몫을 낸다.

    cursor({ts, id})가 있으면 그 시각보다 뒤의 줄만, 그 메시지 id의 줄은 빼고 읽는다. floor(epoch)보다 앞의 줄과
    upto(항목 번호)보다 뒤의 줄은 읽지 않는다. 조각 나누기는 읽지 않는 줄까지 기록 전체로 한다.
    """
    waits = {"AskUserQuestion", "Agent"} if main else {"AskUserQuestion"}
    c_ts = parse_ts((cursor or {}).get("ts"))
    c_id = (cursor or {}).get("id")
    first_dir, current, pieces = None, None, []
    for i, e in enumerate(entries):
        if upto is not None and i > upto:
            break
        if e["kind"] == "other" and current is None:
            continue
        if e["kind"] == "directive" and first_dir is None:
            first_dir = e
        if current is None or (e["kind"] == "directive" and opens_round(e, role)):
            opener = e if e["kind"] == "directive" else None
            wt = worktree_in(opener and opener["text"]) or worktree_in(first_dir and first_dir["text"]) \
                or (e.get("cwd") or "").rstrip("/")
            current = {"key": e["uuid"] or e["t"], "worktree": wt, "es": []}
            pieces.append(current)
        if c_ts is not None and (e["ts"] <= c_ts or (c_id and e.get("mid") == c_id)):
            continue
        if floor is not None and e["ts"] < floor:
            continue
        current["es"].append(e)
    out = []
    for p in pieces:
        if not p["es"]:
            continue
        last = p["es"][-1]
        out.append({"key": p["key"], "worktree": p["worktree"], "cursor": {"ts": last["t"], "id": last.get("mid")},
                    **piece_stats(p["es"], waits)})
    return out


def union_seconds(intervals):
    """[[start, end], …](ISO 시각)를 겹친 데 없이 합친 길이."""
    total, end = 0.0, None
    for a, b in sorted((parse_ts(a), parse_ts(b)) for a, b in intervals):
        if end is None or a > end:
            total += b - a
            end = b
        elif b > end:
            total += b - end
            end = b
    return total


# ---------------------------------------------------------------- 표기


def half_up(x, digits=0):
    """0.5에서 올린다 — 파이썬 round의 짝수 맞춤을 쓰지 않는다."""
    q = 10 ** digits
    return math.floor(x * q + 0.5 + 1e-9) / q


def fmt_duration(sec):
    if sec < 60:
        return "1분 미만"
    h, m = divmod(int(half_up(sec / 60)), 60)
    if not h:
        return f"{m}분"
    return f"{h}시간" if not m else f"{h}시간 {m}분"


def fmt_usd(usd):
    one = half_up(usd, 1)
    return f"${int(half_up(usd))}" if one >= 10 else f"${one:.1f}"


def fmt_cost(usd, unpriced):
    if usd is None:
        return "가격 미상"
    return f"{fmt_usd(usd)} 가격 미상 포함" if unpriced else fmt_usd(usd)


# ---------------------------------------------------------------- 세션 폴더


def session_dir(main_path):
    return main_path[:-len(".jsonl")] if main_path.endswith(".jsonl") else main_path


def agent_files(sess_dir):
    return sorted(glob.glob(os.path.join(sess_dir, "subagents", "agent-*.jsonl")))


def agent_key(path):
    return os.path.basename(path)[len("agent-"):-len(".jsonl")]


def read_meta(path):
    try:
        with open(path[:-len(".jsonl")] + ".meta.json") as f:
            meta = json.load(f)
        return meta if isinstance(meta, dict) else {}
    except (OSError, ValueError):
        return {}


def spawns(entries):
    """메인 기록의 `Agent` 호출마다 {ts, input, agent_id, name}. 결과의 agentId(팀원이면 name)가 기록 파일과 잇는 열쇠다."""
    calls = {}
    for e in entries:
        if e["kind"] == "msg":
            for tid, name, inp in e["tools"]:
                if name == "Agent":
                    calls[tid] = {"ts": e["ts"], "input": inp, "agent_id": None, "name": None}
        elif e["kind"] == "result":
            tur = e["tur"] if isinstance(e["tur"], dict) else {}
            for tid in e["ids"]:
                if tid in calls:
                    calls[tid]["agent_id"] = tur.get("agentId")
                    if tur.get("status") == "teammate_spawned":
                        calls[tid]["name"] = tur.get("name")
    return list(calls.values())


def links(spawn, key, meta):
    if spawn["agent_id"] and key == spawn["agent_id"]:
        return True
    name = spawn["name"]
    # 팀원의 기록 파일은 agent-a<이름>-<16자리 소문자 16진수>다. 앞머리만 대면 이름이 더 긴 다른 팀원과 이어진다
    return bool(name) and (re.fullmatch(rf"a{re.escape(name)}-[0-9a-f]{{16}}", key) is not None
                           or meta.get("agentType") == name)


# ---------------------------------------------------------------- table


def fail(text):
    print(text, file=sys.stderr)
    return 1


def table(path, as_json):
    if not os.path.isfile(path):
        return fail(f"세션 기록 파일이 없다: {path}")
    entries, has_session = load(path)
    if not has_session:
        return fail(f"세션 기록이 아니다(sessionId가 있는 줄이 없음): {path}")
    main_pieces = measure(entries, "main", main=True)
    started = [e["ts"] for e in entries if e["kind"] == "directive"]
    last_msgs = [e["ts"] for e in entries if e["kind"] == "msg"]
    agents, files = [], []
    for f in agent_files(session_dir(path)):
        meta = read_meta(f)
        role = role_of(meta)
        es, _ = load(f)
        pieces = measure(es, role)
        msgs = [e["ts"] for e in es if e["kind"] == "msg"]
        last_msgs += msgs
        seen = [e["ts"] for e in es if e["kind"] != "other"]
        tokens = {}
        for p in pieces:
            add_tokens(tokens, p["tokens"])
        usd, unpriced = price(tokens)
        files.append((agent_key(f), meta))
        agents.append({
            "agent": agent_key(f), "name": meta.get("agentType") or "", "description": meta.get("description") or "",
            "start": seen[0] if seen else None, "end": seen[-1] if seen else None, "role": role, "stage": stage_of(role),
            "rounds": len(pieces), "directives": sum(p["directives"] for p in pieces),
            "work_seconds": sum(p["work_seconds"] for p in pieces),
            "span_seconds": (msgs[-1] - msgs[0]) if msgs else 0,
            "intervals": [iv for p in pieces for iv in p["intervals"]],
            "tokens": tokens, "usd": usd, "unpriced": unpriced,
        })
    sp = [s for s in spawns(entries) if s["agent_id"] or s["name"]]
    missing = sum(1 for s in sp if not any(links(s, k, meta) for k, meta in files))
    unlinked = sum(1 for k, meta in files if not any(links(s, k, meta) for s in sp))

    stages = {}
    for key, _ in STAGES:
        rows = [a for a in agents if a["stage"] == key]
        if not rows:
            continue
        tokens = {}
        for a in rows:
            add_tokens(tokens, a["tokens"])
        usd, unpriced = price(tokens)
        stages[key] = {"work_seconds": union_seconds([iv for a in rows for iv in a["intervals"]]),
                       "tokens": tokens, "usd": usd, "unpriced": unpriced}
        if key in AUDIT_STAGES:
            stages[key]["rounds"] = sum(a["rounds"] for a in rows)
    main_tokens = {}
    for p in main_pieces:
        add_tokens(main_tokens, p["tokens"])
    m_usd, m_unpriced = price(main_tokens)
    main = {"work_seconds": sum(p["work_seconds"] for p in main_pieces), "tokens": main_tokens,
            "usd": m_usd, "unpriced": m_unpriced}
    total_usd = sum(x["usd"] or 0 for x in list(stages.values()) + [main])
    unpriced_any = any(x["unpriced"] for x in list(stages.values()) + [main])
    # 모든 단계가 가격 미상이면 합계도 $0이 아니라 「가격 미상」이다
    total_cost = fmt_cost(total_usd if any(has_priced(x["tokens"]) for x in list(stages.values()) + [main])
                          or not unpriced_any else None, [])
    total_seconds = (max(last_msgs) - min(started)) if started and last_msgs else 0
    out = {"agents": [{k: v for k, v in a.items() if k != "intervals"} for a in agents], "stages": stages,
           "main": main, "total_usd": total_usd, "unpriced": unpriced_any, "total_seconds": total_seconds,
           "missing": missing, "unlinked": unlinked}
    if as_json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0

    def total(tokens, k):
        return sum(t[k] for t in tokens.values())

    labels = dict(STAGES)
    rows = [("이름", "역할", "단계", "회차", "지시 줄", "일한 시간", "첫~마지막 메시지", "새 입력", "캐시 쓰기 5분",
             "캐시 쓰기 1시간", "캐시 읽기", "출력", "달러(하한)")]
    for a in agents:
        rows.append((a["name"] or a["agent"], a["role"], labels[a["stage"]], a["rounds"], a["directives"],
                     fmt_duration(a["work_seconds"]), fmt_duration(a["span_seconds"]),
                     *(total(a["tokens"], k) for k in KINDS), fmt_cost(a["usd"], a["unpriced"])))
    lines = ["\t".join(map(str, r)) for r in rows]
    lines += ["", "\t".join(("단계", "일한 시간", "달러(하한)"))]
    for key, s in stages.items():
        cost = fmt_cost(s["usd"], s["unpriced"]) + (f"({s['rounds']}회)" if "rounds" in s else "")
        lines.append("\t".join((labels[key], fmt_duration(s["work_seconds"]), cost)))
    lines.append("\t".join(("메인", fmt_duration(main["work_seconds"]), fmt_cost(main["usd"], main["unpriced"]))))
    lines.append(f"합계\t\t{total_cost}" + (" · 가격 미상 모델은 합계에서 뺌" if unpriced_any else ""))
    lines.append(f"전체 시간\t{fmt_duration(total_seconds)}")
    if missing:
        lines.append(f"에이전트 기록 {missing}개가 없어 뺐다")
    if unlinked:
        lines.append(f"띄운 기록과 잇지 못한 에이전트 {unlinked}")
    print("\n".join(lines))
    return 0


def main(argv):
    if argv[:1] == ["table"]:
        # --json은 경로 앞이든 뒤든 받는다
        paths = [x for x in argv[1:] if x != "--json"]
        if len(paths) == 1:
            return table(paths[0], "--json" in argv[1:])
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
