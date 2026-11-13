---
name: worktree
description: Make, use, and remove a git worktree for a task in any project that has a `.worktrees.json` file. Use before you change code or documents in a repository, when you start a branch, when you isolate a subagent, and when you clean up a finished worktree.
---

# Worktree

Do not make a branch in the main folder (the main checkout of the repository). Make a worktree and work there.

## Before you start

Read `.worktrees.json` at the root of the main folder. If it is missing, tell the user to run `/worktrees:worktree-setup`, then stop.

`location` is one of three values. The slug is the branch name with each `/` changed to `-`.

| location | worktree path |
|---|---|
| `inside` | `<main folder>/.worktrees/<slug>` |
| `sibling` | `<parent of main folder>/<main folder name>-<slug>` |
| `paseo` | The Paseo default path. Use `sibling` when you make the worktree without Paseo. |

## Make

Use Paseo when `paseo` is on PATH or at `/Applications/Paseo.app/Contents/Resources/bin/paseo`:

```bash
paseo workspace create --isolation worktree --path <main folder> --mode branch-off \
  --new-branch <branch> --base origin/main --no-background --json
```

- Work in the `cwd` of the output. If `cwd` is not the path in the table, the placement plugin is not installed. Tell the user to run `/worktrees:worktree-setup`.
- Always write `--no-background`. `--background` hides the workspace from the Paseo sidebar, and visibility cannot change after creation. If you omit the flag, a Paseo agent caller passes its own visibility to the new workspace.
- Paseo copies the files in `.worktreeinclude` and runs `worktree.setup` from `paseo.json`.
- The branch has no upstream. The first push is `git push -u origin <branch>`.

Without Paseo:

```bash
git fetch origin main
git worktree add --no-track -b <branch> <path from the table> origin/main
```

- `--no-track` stops the first `git push` from going to main.
- Copy each file that `.worktreeinclude` lists from the main folder to the same relative path in the worktree.
- Run the `worktree.setup` command of `paseo.json` in the worktree.

## Subagents

- Subagent isolation (`isolation: "worktree"` of the Agent tool) is allowed. Claude Code puts these worktrees in `.claude/worktrees/` and removes them when they have no changes. Merge the changes that a subagent returns, then remove its worktree.
- Put the absolute path of the worktree in every subagent brief. A subagent starts in the main folder of the session. Without the path it can change the main folder.

## Remove

- Paseo worktree: `paseo workspace archive <workspaceId>`. Find the id with `paseo workspace ls --background --json` by `cwd`. Archive removes the folder and keeps the local branch. Delete a merged local branch with `git branch -d`.
- Git worktree: `git worktree remove <path>`, then `git branch -d <branch>` when the branch is merged.
