# Testing in real Obsidian

The existing `npm test` suite uses mocks. The separate E2E suite uses
WebdriverIO and [wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service)
to run the built plugin inside real Obsidian, including real SortableJS pointer
input, Markdown writes, metadata indexing, and Bases queries.

## Isolation and synthetic data

**Never point this suite at your personal vault.** There is deliberately no vault
path override. `e2e/vault/` is authored entirely from scratch: a fictional polygon
laboratory, four numbered prisms, artificial `phase`/`band` values, and an exclusion
sentinel. No personal vault was inspected or copied to create it. It contains no
personal notes, real projects, media, remote images, Sync settings, credentials,
third-party plugins, or themes. Its `.obsidian` files are minimal test configuration,
not exported application settings.

The service copies this fixture and creates an isolated application profile. Each
test explicitly requests a fresh copy. Filesystem helpers check both the running
app's vault path and the synthetic marker before accessing the copy, and refuse
the tracked fixture itself. Restart tests deliberately preserve the current copy
so they actually test persistence. Only the built plugin and the service's helper
plugin are installed. The service owns process/profile/vault cleanup.

The committed fixture is checked by the fast test suite. Do not import files,
settings, plugins, or themes from any real vault, even after anonymizing them.

## Local macOS testing

Use Node 24 (`nvm use`) and install dependencies with `npm ci`.

```sh
npm test                    # fast tests, no Obsidian
npm run test:e2e             # build, typecheck E2E, launch real Obsidian
npm run test:e2e:debug       # longer timeouts and verbose runner logs
npm run dev:obsidian        # manual exploration of a disposable fixture copy
```

The first run downloads Obsidian and its matching ChromeDriver. Subsequent runs
reuse `.obsidian-cache/`. Local tests open real desktop windows. They never attach
to an existing personal Obsidian instance. No Obsidian account is needed.

For interactive debugging, temporarily add `await browser.debug()` to a spec and
run `test:e2e:debug`. Do not commit the breakpoint. To run a single case:

```sh
npm run build
npm run test:e2e:built -- --mochaOpts.grep 'external filesystem'
```

Alternatively build once, then use `npm run test:e2e:built -- --mochaOpts.grep ...`.
`test:e2e:built` intentionally does not rebuild: CI uses it to test the exact
artifact produced by the build job. Never use it locally with stale output.

The default app and installer are both pinned to public **1.10.6**. This is a
public baseline, **not verification of the exact declared minimum 1.10.2**, which
was early-access. To reproduce another public version:

```sh
OBSIDIAN_APP_VERSION=latest OBSIDIAN_INSTALLER_VERSION=latest npm run test:e2e
```

Installer and app versions are distinct: the installer determines Electron and
ChromeDriver compatibility. Change the pinned defaults in the config, CI inputs,
and manual-launch command together. No binary/profile/vault overrides are exposed.

## Coverage

- Real Bases registration, filtering, columns, and swimlanes.
- Pointer-driven moves across columns and both grouping axes; actual file and
  metadata assertions; restart verification.
- Consecutive completed drags without duplicate cards (not an overlapping-write
  stress test; the fast tests cover those races).
- Column color and collapsed-lane preferences saved to `.base` and restored after
  restarting the application without reseeding its vault.
- Pointer-driven card and column ordering restored after an app restart.
- Quick-add through the UI, with correct folder and grouping properties.
- External filesystem edits flowing through watchers, metadata, and Bases.
- Plugin disable/re-enable without duplicate boards or cards.

Use bounded polling and runner assertions, not arbitrary sleeps. Exercise gestures
through WebDriver; never call the plugin's private drop handlers in E2E tests.

## Linux and CI

Linux needs Xvfb, Xauth, Openbox, Electron's system libraries, and fonts. On Ubuntu
24.04 install the packages listed in `.github/workflows/e2e-runner.yml`, build the
plugin, then run:

```sh
bash scripts/e2e-linux.sh
```

PR/main CI runs `test → build → e2e → release`. E2E downloads the exact build
artifact; release remains gated on successful E2E and publishes that same build.
The existing `test` and `build` checks are unchanged. Once the E2E check has proved
stable, maintainers can add it to required branch checks through the normal settings.

A separate weekly/manual workflow tests the latest public app and installer. It
does not publish releases, require secrets, or block unrelated PRs. Latest downloads
are not cached so a moving alias cannot reuse stale version metadata.

Failed tests save screenshots, DOM, console output, resolved capabilities/version
information, and synthetic Markdown/board files under `e2e-results/` before cleanup.
CI uploads these for seven days. Startup failures may only produce runner logs.
Caches and diagnostics are ignored by Git. Do not upload artifacts from personal
Obsidian sessions or expose debugging ports to a network.

Docker and Android are intentionally deferred. Linux desktop tests do not establish
native macOS or real mobile touch compatibility; native macOS runs and eventual
Android/device tests remain complementary.
