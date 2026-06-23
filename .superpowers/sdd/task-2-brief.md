# Task 2: runtime selection + daemon wiring + doctor/spawn hints

## Goal
Wire the new tmux adapter (Task 1, package `internal/adapters/runtime/tmux`) into
the daemon by platform: select **tmux on Darwin/Linux**, keep **zellij on Windows**
(interim — the Windows ConPTY adapter is a later phase). Keep the build and the
whole test suite green on this Darwin machine, and keep `GOOS=windows go build`
compiling. Do NOT delete the zellij package (Windows still uses it).

Repo: `/Users/harshitsinghbhandari/Downloads/side-quests/rv-code/ReverbCode`,
module in `backend/`. Branch `migrate-zellij-to-tmux-conpty` is checked out.
Module path prefix: `github.com/aoagents/agent-orchestrator/backend`.

## Background you need (verified facts)
Every runtime consumer already depends on a NARROW structural interface, so they
need no change:
- `internal/terminal/attachment.go` `PTYSource` = AttachCommand + IsAlive
- `internal/daemon/lifecycle_wiring.go` `runtimeMessageSender` = SendMessage
- `internal/observe/reaper/reaper.go` `runtimeProber` = IsAlive (reaper.New takes it)
- `internal/session_manager/manager.go` `runtimeController` = Create + Destroy
  (Deps.Runtime is type `runtimeController`)
- `internal/review/launcher.go` `reviewerRuntime` = Create + IsAlive + SendMessage
  (NewLauncher takes it)
- `internal/daemon/lifecycle_wiring.go` `startLifecycle` takes `ports.Runtime`

The ONLY place pinned to the concrete type is
`startSession(cfg, runtime *zellij.Runtime, ...)` at
`internal/daemon/lifecycle_wiring.go:65`, called from `daemon.go:122`.

Both `zellij.Runtime` and `tmux.Runtime` implement the SAME superset of methods:
Create, Destroy, IsAlive, SendMessage, GetOutput, AttachCommand.

## What to build

### 1. New package `internal/adapters/runtime/runtimeselect`
Define the union interface that the daemon wires and that both adapters satisfy:
```go
package runtimeselect

type Runtime interface {
    ports.Runtime // Create, Destroy, IsAlive
    SendMessage(ctx context.Context, handle ports.RuntimeHandle, message string) error
    GetOutput(ctx context.Context, handle ports.RuntimeHandle, lines int) (string, error)
    AttachCommand(handle ports.RuntimeHandle) (argv []string, env []string, err error)
}
```
Add a constructor that picks the backend by OS:
```go
// New returns the per-platform runtime: tmux on Darwin/Linux, zellij on Windows
// (the Windows ConPTY adapter lands in a later phase). log is used only for the
// Windows zellij socket-dir warning; nil is allowed.
func New(log *slog.Logger) Runtime
```
- Non-Windows (`runtime.GOOS != "windows"`): return `tmux.New(tmux.Options{})`.
- Windows: replicate today's daemon.go behavior exactly — compute
  `zellij.DefaultSocketDir()`, `os.MkdirAll(dir, 0o700)` and on error
  `log.Warn(... "could not create zellij socket dir; spawns may fail" ...)` (guard
  on nil log), then return `zellij.New(zellij.Options{SocketDir: dir})`.
- Add compile-time assertions: `var _ Runtime = (*tmux.Runtime)(nil)` and
  `var _ Runtime = (*zellij.Runtime)(nil)`.

Keep it minimal (ponytail): no Options struct, no registry, no env knobs the daemon
will not set. A plain `runtime.GOOS` switch is the right altitude (mirrors
agent-orchestrator's `getDefaultRuntime()`).

### 2. Rewire `internal/daemon/daemon.go`
Replace the zellij-specific block (the `zellijSocketDir := zellij.DefaultSocketDir()`
+ MkdirAll + warn + `runtimeAdapter := zellij.New(...)`, currently lines ~89-99)
with a single `runtimeAdapter := runtimeselect.New(log)`. Update the nearby comment
so it no longer says "the Zellij runtime supplies..." — make it runtime-neutral
(e.g. "the selected runtime (tmux on macOS/Linux, zellij on Windows) supplies the
PTY-attach command and liveness"). Remove the now-unused `zellij` import from
daemon.go IF nothing else there uses it (check; `os` may also become unused — only
remove imports that are truly unused). `terminal.NewManager(runtimeAdapter, ...)`,
`newSessionMessenger(store, runtimeAdapter, ...)`, `startLifecycle(..., runtimeAdapter, ...)`,
and `startSession(cfg, runtimeAdapter, ...)` calls stay as-is (they take interfaces
or the union).

### 3. Change `startSession` signature in `internal/daemon/lifecycle_wiring.go`
Change the param `runtime *zellij.Runtime` to `runtime runtimeselect.Runtime`.
Update the doc comment ("over the real zellij runtime" -> runtime-neutral). The body
is unchanged: it passes `runtime` into `sessionmanager.Deps{Runtime: runtime}` (the
union satisfies `runtimeController`) and `reviewcore.NewLauncher(reviewers, runtime)`
(the union satisfies `reviewerRuntime`). Remove the now-unused `zellij` import from
lifecycle_wiring.go if it becomes unused.

### 4. Runtime-aware doctor check `internal/cli/doctor.go`
Today (~lines 294-308) it runs `zellij --version` and validates against
`zellij.CheckVersionOutput`/`zellij.RequiredVersion`. Make the tool check match the
selected runtime:
- Non-Windows: check for **tmux**. Resolve `exec.LookPath("tmux")`; run `tmux -V`;
  report a pass with the version string (e.g. "tmux (version 3.6b)"). tmux has no
  hard minimum version for our usage, so presence + version is enough — do NOT
  invent a strict semver gate. If tmux is missing, report the existing failure
  level the function uses for a missing tool, with name "tmux".
- Windows: keep the existing zellij version check unchanged.
Use the same `doctorCheck{...}` shape, `doctorSectionTools` section, and pass/fail
levels already in the file. Read the surrounding function to match its structure and
the exact way it shells out (it likely has a helper for running the tool).

### 5. Runtime-aware attach hint `internal/cli/spawn.go`
Today (~lines 101-106) it prints `zellij attach <SessionName>` plus a
ZELLIJ_SOCKET_DIR note. Make it runtime-aware:
- Non-Windows: print `tmux attach -t <name>` where `<name>` is the tmux session
  name for the session id. For this you need an EXPORTED sanitizer in the tmux
  package: add `func SessionName(id string) string` to the tmux package (it
  already sanitizes internally for Create — expose that same function, mirroring
  `zellij.SessionName`). No socket-dir note is needed for tmux.
- Windows: keep the existing `zellij attach` hint (with the socket-dir note).

### 6. Update `internal/daemon/wiring_test.go`
It currently calls `zellij.New(zellij.Options{})`, `startSession(cfg, runtime, ...)`,
`startLifecycle(ctx, store, zellij.New(...), ...)`, and `zellij.DefaultSocketDir()`.
After the signature change, `startSession` takes `runtimeselect.Runtime`. Update the
test to pass a value that satisfies it. Simplest and most faithful: construct the
real selected runtime via `runtimeselect.New(nil)` (on this Darwin box that yields
the tmux adapter, and tmux is installed), OR pass `tmux.New(tmux.Options{})`
directly. Keep the test's intent. If a sub-test asserts specifically on
`zellij.DefaultSocketDir()` semantics, keep that sub-test pointed at zellij directly
(it is testing the zellij helper, which still exists) — do not delete coverage; just
make it compile and pass. Read the whole test file and adjust only what the signature
change forces.

## Definition of done (runnable checks — run from `backend/`)
- `go build ./...` succeeds.
- `GOOS=windows go build ./...` succeeds (Windows still compiles on the zellij path).
- `go test ./...` passes (the full backend suite). If any pre-existing test is
  flaky/unrelated-failing, note it in the report; do not paper over a failure your
  change caused.
- `go vet ./internal/daemon/... ./internal/cli/... ./internal/adapters/runtime/...`
  is clean.

## Hard rules / constraints
- Never use em dashes ("—") anywhere in code, comments, or commit messages. Use
  periods, commas, semicolons, or parentheses.
- Do NOT delete the zellij package or change its behavior (Windows depends on it).
- Do NOT change the narrow consumer interfaces or the terminal layer.
- No new Go dependencies. go.mod unchanged.
- Keep changes minimal and on-pattern (ponytail). Mark any deliberate shortcut with
  a `ponytail:` comment.
- Commit on the current branch with a clear message ending in the
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.
