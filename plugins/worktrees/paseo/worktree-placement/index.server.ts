import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import type { PluginServerContext } from "@getpaseo/plugin/server";

const run = promisify(execFile);

type Place = (repoRoot: string, slug: string) => Promise<string | undefined>;

// 데몬 전체에 걸리는 훅이라, 그 저장소의 git이 `.worktrees/`를 무시할 때만 안쪽에 둔다.
// 무시하지 않는 저장소에 두면 워크트리 전체가 추적 안 되는 파일로 잡힌다.
async function ignoredPath(repoRoot: string, path: string) {
  try {
    await run("git", ["-C", repoRoot, "check-ignore", "-q", path]);
    return path;
  } catch {
    return undefined;
  }
}

const places = {
  inside: (repoRoot, slug) => ignoredPath(repoRoot, join(repoRoot, ".worktrees", slug)),
  sibling: async (repoRoot, slug) => join(dirname(repoRoot), `${basename(repoRoot)}-${slug}`),
  paseo: async () => undefined,
} satisfies Record<string, Place>;

async function readPlace(repoRoot: string) {
  try {
    const { location } = JSON.parse(await readFile(join(repoRoot, ".worktrees.json"), "utf8"));
    return Object.hasOwn(places, location) ? places[location as keyof typeof places] : undefined;
  } catch {
    return undefined;
  }
}

export default function contribute(server: PluginServerContext) {
  return server.addHook("worktree.create.before", async ({ request }) => {
    const place = await readPlace(request.repoRoot);
    const path = await place?.(request.repoRoot, request.branch.replaceAll("/", "-"));
    return path ? { ...request, path } : undefined;
  });
}
