# Migration: Zellij -> tmux (Darwin/Linux) + ConPTY (Windows)

Branch: migrate-zellij-to-tmux-conpty
Base commit: e970f72

## Phase A (Darwin/Linux, fully testable here)
- Task 1: tmux runtime adapter (adapters/runtime/tmux/) — COMPLETE
- Task 2: runtime selection + daemon wiring + doctor/spawn hints — IN PROGRESS

## Ledger
Task 1: complete (commits e970f72..44c3e61, review clean — spec PASS, 34 tests green, no em dashes)

## Phase B (Windows, needs a Windows box to verify) — DEFERRED
- In-process ConPTY runtime + Attacher/Stream interface change + delete zellij

## Ledger
(append "Task N: complete (commits <base7>..<head7>, review clean)" as tasks finish)
