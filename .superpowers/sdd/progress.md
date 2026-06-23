# Migration: Zellij -> tmux (Darwin/Linux) + ConPTY (Windows)

Branch: migrate-zellij-to-tmux-conpty
Base commit: e970f72

## Phase A (Darwin/Linux, fully testable here)
- Task 1: tmux runtime adapter (adapters/runtime/tmux/) — COMPLETE
- Task 2: runtime selection + daemon wiring + doctor/spawn hints — COMPLETE

## Ledger
Task 1: complete (commits e970f72..44c3e61, review clean — spec PASS, 34 tests green, no em dashes)
Task 2: complete (commits 44c3e61..4b21e4b, review clean — spec PASS, quality APPROVED, 1585 tests green, GOOS=windows builds; cosmetic minors fixed in 4b21e4b)

## Phase A FINAL: SHIP (whole-branch review verified vs real tmux 3.6b)
- darwin/linux/windows all build; full suite 1585 passed in 75 packages.
- IsAlive dead-vs-transient contract, keep-alive session survival, attach path, selector wiring, union interface all verified.
- Handle-ID format change (bare session id vs zellij session/pane) breaks no consumer (none parse it).
- Dead runner.Start removed (commit 926ee31). HEAD = 926ee31.
- Known follow-up (non-blocking): stale "Zellij" comments in internal/terminal/attachment.go are now runtime-neutral in behavior but Zellij-worded in prose.

## Phase B (Windows ConPTY) — IN PROGRESS
User directive: port agent-orchestrator's proven detached pty-host + named-pipe +
registry design to Go (NOT the in-process holder). Integration = strategy 2:
evolve terminal PTYSource.AttachCommand -> Attacher.Attach(...) Stream so conpty
dials the pipe directly. Windows-only code can only be compile-checked here.

Tasks:
- B1: conpty protocol codec + ring buffer (cross-platform, fully unit-tested) — COMPLETE (926ee31..d67941b, 16 tests, -race clean, review APPROVED)
- B2: windows pty-host registry — COMPLETE (..6552e26, 10 tests -race clean, win+linux+darwin build)
- B3: pty-host serve engine (loopback TCP, NOT named pipe; ConPTY behind interface seam) — COMPLETE (41ce417..6cd6e2a, 35 tests -race clean incl. ordering regression test, review APPROVED; loopback decision documented; Windows go-pty file compile-checked only)
- B4: conpty runtime adapter — COMPLETE (be06609..0bc26e5, 49 tests -race, IsAlive dead-vs-transient fixed, registry-recovery path; Windows spawn file compile-checked only)
- B5: terminal Attach/Stream interface change + tmux/zellij/conpty Attach — COMPLETE (8d757ed..HEAD, 1638 tests -race across 78 pkgs, all 3 GOOS, real tmux+zellij attach integration pass, review APPROVED; conpty loopbackStream stress-tested clean)
- B6: select conpty on Windows + delete zellij + pty-host subcommand + doctor/spawn — COMPLETE (b9ef1f5..HEAD, 1607 tests -race across 77 pkgs, all 3 GOOS, zellij GONE, arg-contract verified, review APPROVED)

Faithful-port references (agent-orchestrator):
- packages/plugins/runtime-process/src/pty-host.ts (protocol, ring, fan-out, shutdown)
- packages/plugins/runtime-process/src/pty-client.ts (chunking 512/15ms, Enter 300ms, STATUS probe)
- packages/plugins/runtime-process/src/index.ts (detached spawn, READY handshake, destroy grace)
- packages/core/src/windows-pty-registry.ts (sideband JSON, PID-liveness prune)

## Phase B (Windows, needs a Windows box to verify) — DEFERRED
- In-process ConPTY runtime + Attacher/Stream interface change + delete zellij

## Ledger
(append "Task N: complete (commits <base7>..<head7>, review clean)" as tasks finish)

## FINAL: Phase B SHIP (whole-branch review)
All 6 Phase B tasks complete + reviewed. End state: tmux (Darwin/Linux), conpty (Windows), zellij deleted.
darwin/linux/windows build; 1607 tests -race across 77 pkgs; vet clean.
VERIFIED on Darwin: full tmux path + all cross-platform conpty internals (protocol, ring, host serve engine over real loopback w/ fake ptyConn, client/attach, registry, dead-vs-transient IsAlive, injectable-spawn Create/Destroy).
UNVERIFIED (needs Windows hardware): real go-pty ConPTY child spawn, detached-spawn survival, OpenProcess pidAlive, 0x800700e8 cleanup ordering.
HEAD = 284e840
