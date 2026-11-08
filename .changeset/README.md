# Changesets

Every ordinary PR must add a changeset. Run `npm run changeset` for user-facing changes, or `npm run changeset -- --empty` for changes that do not need a release.

Use patch for fixes, minor for features, and major for breaking changes (including moving from 0.x to 1.0.0).

Maintainers open release PRs manually using `npm run version`. See [CONTRIBUTING.md](../CONTRIBUTING.md) and [README.md](../README.md#releasing).
