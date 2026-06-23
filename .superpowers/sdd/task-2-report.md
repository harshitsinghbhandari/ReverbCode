# Task 2 Report: runtime selection + daemon wiring + doctor/spawn hints

## Status: DONE

## Files Changed

### New file
- `backend/internal/adapters/runtime/runtimeselect/runtimeselect.go`
  - Defines the `Runtime` union interface (embeds `ports.Runtime`; adds `SendMessage`, `GetOutput`, `AttachCommand`).
  - `New(log *slog.Logger) Runtime` returns `tmux.New(tmux.Options{})` on non-Windows, and replicates the old daemon zellij socket-dir setup on Windows.
  - Compile-time assertions: `var _ Runtime = (*tmux.Runtime)(nil)` and `var _ Runtime = (*zellij.Runtime)(nil)`.

### Modified files

**`backend/internal/daemon/daemon.go`**
- Swapped `zellij` import for `runtimeselect`.
- Replaced the 10-line zellij socket-dir block with `runtimeAdapter := runtimeselect.New(log)`.
- Updated the terminal-streaming comment to be runtime-neutral.
- `os` import retained (still used by `newLogger()` for `os.Stderr`).

**`backend/internal/daemon/lifecycle_wiring.go`**
- Swapped `zellij` import for `runtimeselect`.
- Changed `startSession` param from `runtime *zellij.Runtime` to `runtime runtimeselect.Runtime`.
- Updated doc comment from "over the real zellij runtime" to "over the selected runtime".

**`backend/internal/cli/doctor.go`**
- Added `"runtime"` stdlib import.
- Renamed call site from `c.checkZellij(ctx)` to `c.checkTerminalRuntime(ctx)`.
- Added `checkTerminalRuntime` dispatcher: calls `checkTmux` on non-Windows, `checkZellij` on Windows.
- Added `checkTmux`: resolves `tmux` via `LookPath`, runs `tmux -V`, reports PASS with version string; WARN for missing (matching the zellij missing-level so end-to-end `ok: true` tests remain green), FAIL if found but version command errors.
- Kept `checkZellij` intact (Windows still uses it).

**`backend/internal/cli/spawn.go`**
- Added `"runtime"` stdlib import and `tmux` adapter import.
- Replaced unconditional `zellij attach` hint with a runtime-aware block:
  - Non-Windows: `tmux attach -t <name>` using `tmux.SessionName(res.Session.ID)`.
  - Windows: existing `ZELLIJ_SOCKET_DIR=... zellij attach <name>` hint (unchanged).

**`backend/internal/daemon/wiring_test.go`**
- Added `runtimeselect` import.
- `TestWiring_StartSessionBuildsSessionService`: replaced `zellij.New(zellij.Options{})` with `runtimeselect.New(nil)` so the test compiles and passes after the `startSession` signature change.
- `TestWiring_StartLifecycleThreadsMessengerIntoLCM` and `TestDaemonZellijSocketDir_LeavesBudgetForSessionNames` still use `zellij` directly; those sub-tests are testing zellij semantics that still exist and were not changed.

**`backend/internal/cli/doctor_test.go`**
- Renamed and rewrote the three zellij-specific tool tests to cover `checkTmux` (on Darwin):
  - `TestDoctorChecksZellijVersion` -> `TestDoctorChecksTmuxVersion`
  - `TestDoctorFailsUnsupportedZellijVersion` -> `TestDoctorChecksTmuxVersionFailsOnError`
  - `TestDoctorWarnsWhenZellijMissing` -> `TestDoctorWarnsWhenTmuxMissing`

## Union Interface

```go
type Runtime interface {
    ports.Runtime // Create, Destroy, IsAlive
    SendMessage(ctx context.Context, handle ports.RuntimeHandle, message string) error
    GetOutput(ctx context.Context, handle ports.RuntimeHandle, lines int) (string, error)
    AttachCommand(handle ports.RuntimeHandle) (argv []string, env []string, err error)
}
```

## SessionName export

`tmux.SessionName(id string) string` was already exported in Task 1 (line 267 of `tmux.go`). No change needed.

## Handling of wiring_test.go

The only test that called `startSession` with a concrete `*zellij.Runtime` was `TestWiring_StartSessionBuildsSessionService`. It now passes `runtimeselect.New(nil)` (which returns the tmux adapter on Darwin). Tests that still use `zellij.New` directly (`startLifecycle` call and `DefaultSocketDir` assertion) were left untouched; they test zellij semantics and compile fine because the zellij import remains.

## Verification Outputs

All run from `backend/`.

### `go build ./...`
```
Go build: Success
```

### `GOOS=windows go build ./...`
```
Go build: Success
```

### `go test ./...`
```
Go test: 1585 passed in 75 packages
```

### `go vet ./internal/daemon/... ./internal/cli/... ./internal/adapters/runtime/...`
```
Go vet: No issues found
```

## Concerns

None. All checks green, no pre-existing failures, no new dependencies, go.mod unchanged.
