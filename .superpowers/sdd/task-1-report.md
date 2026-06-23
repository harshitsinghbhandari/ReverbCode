# Task 1 Report: tmux Runtime Adapter

## What was built

New package `backend/internal/adapters/runtime/tmux` implementing `ports.Runtime`
via the tmux CLI. Four files were created (no existing files modified):

- `backend/internal/adapters/runtime/tmux/tmux.go` - Runtime struct, Options, New,
  Create/Destroy/IsAlive/SendMessage/GetOutput/AttachCommand, session-name
  sanitization, helpers (chunks, tailLines, trimTrailingBlankLines,
  validateEnvKeys, sortedKeys, shellQuote, buildLaunchCommand, commandError).
- `backend/internal/adapters/runtime/tmux/commands.go` - Arg builders for all tmux
  subcommands (newSessionArgs, setStatusOffArgs, killSessionArgs, hasSessionArgs,
  sendKeysLiteralArgs, sendEnterArgs, capturePaneArgs, exactSessionTarget).
- `backend/internal/adapters/runtime/tmux/tmux_test.go` - 32 unit tests via fakeRunner.
- `backend/internal/adapters/runtime/tmux/tmux_integration_test.go` - 2 integration
  tests gated on `exec.LookPath("tmux")`.

## Design choices

1. Handle format: plain session id string (no session/pane split). tmux needs no
   pane-id discovery; the handle is just `ports.RuntimeHandle{ID: <sanitized-id>}`.

2. Exact session targeting: `kill-session -t =<id>` and `has-session -t =<id>` use
   tmux's `=` exact-name prefix (supported by session-selection commands in tmux
   3.x) to prevent prefix matching ("foo" matching "foobar"). Commands that use
   pane-targeting syntax (set-option, send-keys, capture-pane) use a plain session
   name because they do not support the `=` prefix.

3. Keep-alive shell: `buildLaunchCommand` appends `; exec ${SHELL:-/bin/sh} -i` so
   the tmux session survives agent exit (the whole reason a multiplexer is used).

4. Send-keys chunking: `send-keys -t <id> -l <chunk>` with `-l` flag sends text
   literally (tmux does not interpret "Enter", "C-c", etc. as key names). Chunked
   via ported `chunks()` helper with 16 KB default.

5. `sessionMissingOutput` covers: "can't find session", "no server running",
   "error connecting", "session not found". Both `killSessionMissingOutput` and the
   IsAlive path use this to distinguish definitive-dead from probe-error.

6. `AttachCommand` returns `["tmux", "attach-session", "-t", id]` with nil env
   (no per-session socket dir needed unlike zellij's Windows path).

7. `ponytail:` comments mark the two deliberate simplifications:
   - send-keys -l chunked vs. load-buffer/paste-buffer (ceiling: very large
     messages are slightly slower; 16 KB default is ample for agent prompts).
   - PATH handling matches the zellij unix path.

## Verification output

```
$ cd backend && go build ./...
# success (no output)

$ go test ./internal/adapters/runtime/tmux/... -v
# 34 tests passed (32 unit + 2 integration with real tmux 3.6b)

$ go vet ./internal/adapters/runtime/tmux/...
# no issues
```

## Concerns

None. The build is green, all 34 tests pass (including the integration tests on
the installed tmux 3.6b), and no files outside the new package were modified.

---

# Code-Review Fix Report (commit 44c3e61)

## What was fixed

Four findings from code review, all scoped to `backend/internal/adapters/runtime/tmux/`.

### Finding 1: Em dash removed (hard project rule)

File: `tmux_test.go:462`

Replaced the em dash character in the fatal message with a semicolon:
- Before: `"IsAlive: got nil, want probe error -- failed probe must not read as dead"` (with actual em-dash Unicode)
- After: `"IsAlive: got nil, want probe error; failed probe must not read as dead"`

A full package grep confirmed zero remaining em dashes.

### Finding 2: Integration test session IDs derived from t.Name()

File: `tmux_integration_test.go`

Both integration tests previously used hardcoded session IDs that would collide under `-count=2` or parallel runs:
- `TestRuntimeIntegration`: was `"ao_itest_tmux"`, now `strings.ReplaceAll(t.Name(), "/", "_")`
- `TestRuntimeIntegrationExactSessionParsing`: was `"ao_tmux_exact_long"` / `"ao_tmux_exact"`, now `base + "_long"` / `base` where `base = strings.ReplaceAll(t.Name(), "/", "_")`

Added `domain` import to support the `domain.SessionID(id)` conversion in `RuntimeConfig.SessionID`.

Existing `t.Cleanup`/Destroy guards retained as-is.

### Finding 3: Dead scaffolding removed

File: `tmux_test.go`, `TestCreateDestroysAndReturnsErrorWhenNotAlive`

Removed 14 lines of dead scaffolding: unused `r, fr` and `r2, fr2` variables, their dead output assignments, and the stale comments explaining why they were bypassed. Only the live `r2 + fr3` path remains. Test assertions are unchanged.

### Finding 4: Quoted `${SHELL:-/bin/sh}` in tmux.go

File: `tmux.go` (line 464), `tmux_test.go` (2 assertion sites)

Changed the keep-alive snippet from `exec ${SHELL:-/bin/sh} -i` to `exec "${SHELL:-/bin/sh}" -i` (double-quoted) to handle a `$SHELL` value with spaces in the path.

Updated two unit test assertion strings to match:
- `TestCommandBuilders`: both the input and want literals updated to the quoted form
- `TestCreateLaunchCommandContainsKeepAliveShell`: `strings.Contains` check updated to the quoted form

## Verification command outputs

```
$ cd backend && go build ./...
# success

$ go test ./internal/adapters/runtime/tmux/...
# 34 passed in 1 packages

$ go vet ./internal/adapters/runtime/tmux/...
# no issues

$ grep -rn "—" internal/adapters/runtime/tmux/ || echo "NO EM DASHES"
NO EM DASHES
```

Commit: `44c3e61` on branch `migrate-zellij-to-tmux-conpty`.
