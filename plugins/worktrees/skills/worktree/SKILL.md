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

Use Paseo when `paseo` is on PATH or at `/Applications/Paseo.app/Contents/Resources/bin/paseo`. With Paseo, a work agent does the task inside the new workspace, so the user sees it as a tab of that workspace in the sidebar. The current session coordinates.

1. Make the workspace:

   ```bash
   git -C <main folder> fetch origin main
   paseo workspace create --isolation worktree --path <main folder> --mode branch-off \
     --new-branch <branch> --base origin/main --no-background --json
   ```

   - For an existing branch, use `--mode checkout-branch --branch <branch>` in place of `--mode branch-off --new-branch <branch> --base origin/main`.
   - Keep `workspaceId` and `cwd` from the output. If `cwd` is not the path in the table, the placement plugin is not installed. Tell the user to run `/worktrees:worktree-setup`.
   - Always write `--no-background`. `--background` hides the workspace from the Paseo sidebar, and visibility cannot change after creation. If you omit the flag, a Paseo agent caller passes its own visibility to the new workspace.
   - Paseo copies the files in `.worktreeinclude` and runs `worktree.setup` from `paseo.json`.

2. Start the work agent in the workspace:

   ```bash
   paseo run --workspace <workspaceId> --provider <provider> --mode <permission mode> \
     --title "<task>" --no-wait --json "<brief>"
   ```

   - Use the provider of the current session unless the user names one.
   - Always write `--mode`. The CLI does not use the default mode of the app. Without the flag the agent asks before each edit. Use the `DEFAULT MODE` column of `paseo provider ls` for that provider.
   - The brief is the only context of the work agent. Give the user's goal, every decision made in this conversation, the files to read, the success criteria, and the report you want. The work agent starts in the worktree and loads the project instructions from there.
   - Keep `agentId` from the output.

3. Coordinate:
   - `paseo wait <agentId>` waits until the agent is idle. `paseo logs <agentId>` shows what it did.
   - `paseo send <agentId> "<message>"` gives a follow-up or a user answer.
   - Do not edit files in the worktree while the work agent runs. Review its diff in the worktree before you report to the user.

The branch has no upstream. The first push is `git push -u origin <branch>`.

Without Paseo, the current session works in the worktree:

```bash
git fetch origin main
git worktree add --no-track -b <branch> <path from the table> origin/main
```

- `--no-track` stops the first `git push` from going to main.
- Copy each file that `.worktreeinclude` lists from the main folder to the same relative path in the worktree.
- Run the `worktree.setup` command of `paseo.json` in the worktree.

## Subagents

- Subagent isolation (`isolation: "worktree"` of the Agent tool) is allowed. Claude Code puts these worktrees in `.claude/worktrees/` and removes them when they have no changes. Merge the changes that a subagent returns, then remove its worktree.
- When the session did not start in the worktree, put the absolute path of the worktree in every subagent brief. A subagent starts in the start folder of the session. Without the path it can change the main folder.

## Remove

- Paseo worktree: `paseo workspace archive <workspaceId>`. Find the id with `paseo workspace ls --background --json` by `cwd`. Archive also archives the agents of the workspace, removes the folder, and keeps the local branch. Delete a merged local branch with `git branch -d`.
- Git worktree: `git worktree remove <path>`, then `git branch -d <branch>` when the branch is merged.
