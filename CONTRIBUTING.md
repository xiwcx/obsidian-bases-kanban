# Contributing

Thanks for your interest in contributing to obsidian-bases-kanban.

## Before you start

Check the [issue tracker](https://github.com/xiwcx/obsidian-bases-kanban/issues) to see if your idea or bug is already being discussed. If you haven't contributed before, please open an issue before starting work on a PR — it's much easier to align on approach before code is written.

## Making changes

1. Fork the repo and create a branch from `main`.
2. Add tests for any new or changed functionality.
3. Add a changeset with `npm run changeset`. Select patch for fixes, minor for features, or major for breaking changes (a major bump from 0.x produces 1.0.0). Write a concise user-facing summary; it becomes the changelog and GitHub release notes.
   - For docs, tests, or tooling changes that do not need a release, run `npm run changeset -- --empty`.
   - Commit the new `.changeset/*.md` file with your changes. Every ordinary PR must add one, including follow-up PRs; missing changesets block CI.
   - Do not edit existing changesets or manually bump version files. Keep `minAppVersion` accurate when using newer Obsidian APIs; the release command adds the new compatibility mapping later.
4. Make sure all checks pass locally before opening a PR:
   ```
   npm run format        # Biome must report no formatting violations
   npm run lint          # ESLint must report no errors
   npm test              # all tests must pass
    npm run build         # TypeScript must compile and bundle cleanly
    npm run versions:check
    npm run changeset:check -- origin/main
   ```

## Opening a pull request

When you open a PR, please include:

- **Screenshots or a short video** showing the change in Obsidian
- **Verification criteria** — a brief description of how you tested the change and what edge cases you considered

This makes review faster and helps maintainers understand your intent.

`main` requires an up-to-date PR with passing **test** and **build** checks. A second person's approval is not required. Force pushes and deletion of `main` are blocked.

## Release PRs

Maintainers manually open version PRs using `npm run version` on a clean release branch from current `main`. The command consumes pending changesets, generates `CHANGELOG.md`, and synchronizes all four version files. No new changeset is needed on a release PR: CI checks its version against the base branch's pending release plan and allows only generated release-file changes. Empty changesets alone do not create a release.

Run the usual checks, review the generated notes, and open the PR yourself. Merging it publishes the Obsidian plugin via GitHub Actions; there is no npm publication, GitHub App, PAT, or post-release workflow. See [Releasing](README.md#releasing) for the full procedure and recovery instructions.
