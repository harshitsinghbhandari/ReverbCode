# Task B6: select conpty on Windows, register pty-host subcommand, delete zellij

## Goal
Final wiring of the migration: make Windows use the conpty runtime, register the
`ao pty-host` subcommand that conpty spawns, DELETE the zellij package, and clean up
the remaining zellij references (doctor, spawn hint, wiring test, the terminal attach
integration test). After this, the end state is: tmux on Darwin/Linux, conpty on
Windows, no zellij anywhere. Keep all three GOOS builds green and the full suite
passing on Darwin.

Repo: `/Users/harshitsinghbhandari/Downloads/side-quests/rv-code/ReverbCode`,
module `backend/`, branch `migrate-zellij-to-tmux-conpty`. Module prefix
`github.com/aoagents/agent-orchestrator/backend`.

## Current state (verified)
- `runtimeselect.New(log)` returns tmux on non-Windows, zellij on Windows. The union
  interface already embeds ports.Attacher (Attach). Both tmux and conpty packages
  build on all platforms (conpty's real ConPTY spawn is windows-tagged; a non-windows
  stub errors). conpty.Runtime implements Create/Destroy/IsAlive/SendMessage/GetOutput
  AND Attach (B5), so it satisfies the union.
- conpty's `defaultSpawnHost` (windows-tagged) spawns `<exe> pty-host <sessionID>
  <cwd> <shellCmd> <shellArg...>` and reads `READY:<pid> <port>`. The
  `conpty.RunHost(args []string, stdout io.Writer) int` entrypoint exists but is NOT
  yet registered as a CLI subcommand.
- zellij is referenced outside its package by: `cli/spawn.go` (attach hint),
  `cli/doctor.go` (version check), `runtimeselect/runtimeselect.go` (windows branch),
  `daemon/wiring_test.go` (DefaultSocketDir test + zellij.New), `lifecycle_wiring.go`
  (verify: likely a stale comment/import), and `terminal/attachment_integration_test.go`
  (drives a REAL zellij pane).
- `internal/agentlaunch` is used by `cli/launch.go` (the `ao launch` trampoline) AND
  zellij. After deleting zellij, agentlaunch is still used by cli/launch.go, so KEEP
  agentlaunch.

## Step 1 — switch runtimeselect to conpty on Windows
In `internal/adapters/runtime/runtimeselect/runtimeselect.go`:
- Windows branch returns `conpty.New(conpty.Options{})` (use its real default options;
  check conpty.New's signature). Remove the zellij import, the DefaultSocketDir +
  MkdirAll + warn block (conpty needs no socket dir). The `log` param may become
  unused; if so, keep the signature (callers pass it) but use `_ = log` or drop the
  param and update the one caller in daemon.go (prefer keeping the signature stable;
  use `_ = log` with a short comment, or rename to `_`). 
- Replace the `var _ Runtime = (*zellij.Runtime)(nil)` assertion with
  `var _ Runtime = (*conpty.Runtime)(nil)`. Keep the tmux assertion.
- Update the package doc comment to "tmux on Darwin/Linux, conpty (ConPTY) on Windows".

## Step 2 — register the `ao pty-host` subcommand
Find how existing hidden/internal subcommands are registered (look at
`internal/cli/launch.go` for the `ao launch` trampoline command and how
`internal/cli/root.go` wires subcommands). Add a `pty-host` command (mark it Hidden
like launch if launch is hidden) whose RunE calls
`conpty.RunHost(args, os.Stdout)` and exits with that code (use
`os.Exit(code)` or return an error that maps to the code; match how `launch` does
it). It takes raw positional args (sessionID, cwd, shellCmd, shellArg...). Disable
cobra flag parsing for these positionals if needed (e.g. `DisableFlagParsing: true`
or `Args: cobra.ArbitraryArgs`) so agent shell args with leading dashes are not
eaten. Confirm the arg order matches what conpty's `defaultSpawnHost` passes and what
`RunHost` expects (read both).

## Step 3 — delete the zellij package
- `git rm -r internal/adapters/runtime/zellij`.
- Fix every now-broken reference:
  - `cli/doctor.go`: remove the zellij version check (the `zellij.CheckVersionOutput`/
    `RequiredVersion` block). On Windows there is no external terminal-multiplexer tool
    to check (ConPTY is built into the daemon binary). Either drop the Windows
    terminal-tool check entirely, or emit a trivial pass like "ConPTY (built-in)".
    Keep the tmux check on non-Windows unchanged.
  - `cli/spawn.go`: the Windows attach hint used `zellij attach` + socket dir. conpty
    has no user-facing attach command (the dashboard attaches over loopback). Change
    the Windows hint to direct the user to the dashboard (e.g. "Attach from the AO
    dashboard") or omit the attach line on Windows. Keep the non-Windows tmux hint
    (`tmux attach -t <tmux.SessionName(id)>`) unchanged.
  - `daemon/wiring_test.go`: remove/replace the `zellij.New(...)` usages and the
    `TestDaemonZellijSocketDir...` test. If a sub-test only validated zellij's
    DefaultSocketDir helper (now deleted), delete that sub-test (the helper is gone).
    For any test that needs a runtime, use `runtimeselect.New(nil)` or
    `tmux.New(tmux.Options{})`. Do not weaken coverage of the wiring itself.
  - `daemon/lifecycle_wiring.go`: remove any leftover zellij import/comment (the
    startSession signature already takes `runtimeselect.Runtime`).
  - `terminal/attachment_integration_test.go`: it currently spins up a real zellij
    session to test the attach stream end to end. Re-point it at the **tmux** runtime
    (available on this Darwin box) so the integration coverage survives: create a tmux
    session via `tmux.New(...).Create(...)`, attach via the runtime's `Attach`, assert
    the stream behavior, and clean up (kill the session in t.Cleanup). If re-pointing
    is impractical, gate it on tmux availability with `exec.LookPath` and skip
    otherwise, but prefer making it run against tmux. Keep the test's intent (it
    proves the real attach stream streams a live pane and re-attaches at a new size).

## Step 4 — verify nothing else imports zellij
`grep -rn "runtime/zellij" backend/` must return nothing. Also confirm
`internal/agentlaunch` is still imported by `cli/launch.go` (do NOT delete it).

## Definition of done (from `backend/`)
- `grep -rn "runtime/zellij" .` returns nothing.
- `go build ./...` ; `GOOS=windows go build ./...` ; `GOOS=linux go build ./...` succeed.
- `go test -race ./...` passes (full suite). The tmux-backed attach integration test
  runs (not skipped) and passes against real tmux 3.6b.
- `go vet ./...` clean.
- `grep -rn "—" <each new/edited file>` shows no em dashes in your changes.

## Hard rules
- This removes a whole package and rewires platform selection. Be surgical; keep the
  union interface and all consumer interfaces intact (conpty already satisfies them).
- No new go.mod module. Never use em dashes ("—"). Minimal/idiomatic; mark shortcuts
  with `ponytail:`.
- Commit on the branch; trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
