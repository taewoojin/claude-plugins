---
name: worktree-setup
description: Configure one project for the `worktree` skill. Writes `.worktrees.json`, `paseo.json`, `.worktreeinclude`, the `.gitignore` line, and the tool exclusions, and installs the Paseo placement plugin on this machine. Use when a project has no `.worktrees.json`, or when the worktree location or install command changes.
---

# Worktree setup

Do not hard-code values from one project. Read the project and ask the user.

## 1. Read the code

Find these in the main folder:

- The lock file and its clean install command. This is the `worktree.setup` value of `paseo.json`. Examples: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, `bun install --frozen-lockfile`.
- Git-ignored local config files that exist in the main folder: `.env*`, `*.local.*`, `.claude/settings.local.json`. These go in `.worktreeinclude`. Check each with `git check-ignore`. Never list a file that git tracks.
- Tools that walk the repository tree. Each must exclude `.worktrees/` and `.claude/worktrees/`, or it reads every worktree as part of the project:
  - Metro: `resolver.blockList`
  - Jest: `testPathIgnorePatterns` and `modulePathIgnorePatterns`
  - Vitest: `exclude`
  - ESLint: ignores
  - TypeScript: `exclude`. TypeScript skips dot folders by default, so an explicit entry is not required. Say this in the table.
  - Watchman: `.watchmanconfig` `ignore_dirs`
  - Build upload ignore files: `.easignore`, `.dockerignore`
- Existing `paseo.json`, `.worktreeinclude`, `.worktrees.json`, and `.gitignore` lines. Keep what is there and add to it.

## 2. Ask

Ask only what the code cannot answer. Always ask the worktree location with AskUserQuestion:

- `inside` (recommended): `<main folder>/.worktrees/<slug>`. All worktrees stay in the project folder. It needs a `.gitignore` line and the tool exclusions. It also needs the placement plugin when the user works with Paseo.
- `sibling`: `<parent of main folder>/<main folder name>-<slug>`. Nothing inside the project changes, so no exclusion is necessary. Worktree folders clutter the parent folder.
- `paseo`: Paseo decides the path. It needs no setup in the project. Other tools do not know the path.

## 3. Show the plan

Show one table of every change with the columns file, change, and reason. Include the tool exclusions. Apply nothing until the user approves.

## 4. Apply

- `.worktrees.json`: `{ "location": "<value>" }`
- `paseo.json`: set `worktree.setup`. Keep other keys.
- `.worktreeinclude`: one path per line.
- `.gitignore`: add `.worktrees/` when the location is `inside`.
- Tool exclusions for both `.worktrees/` and `.claude/worktrees/`.

Commit these changes in a worktree of the project, not in the main folder (see the `worktree` skill). The user cannot use `.worktrees.json` from other worktrees until it is committed.

## 5. Machine setup (once per machine, Paseo users only)

Skip this step when the user does not use Paseo.

1. Read `pluginsEnabled` in `~/.paseo/config.json`. A missing field means `false`.
2. If it is not `true`, ask the user before you change it. Say: plugins are trusted code without a sandbox, and plugin code on the daemon can access files, processes, credentials, and network services. After the user agrees, set `pluginsEnabled` to `true` and keep the other keys. Then run `paseo reload --json`.
3. Install the placement plugin from git:
   `paseo plugin install git:taewoojin/claude-plugins:plugins/worktrees/paseo/worktree-placement`
4. `paseo plugin ls` must show `worktree-placement` as `running`. If it does not, read `paseo plugin logs worktree-placement`.

Do not install from the Claude Code plugin cache path. That path changes with each version.

## 6. Check

Make a worktree with the `worktree` skill. Confirm that its path matches the location table. Then archive it.
