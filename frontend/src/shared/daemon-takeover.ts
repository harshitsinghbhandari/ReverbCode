// Pure decision helper for the wedged-orphan kill+replace path.
//
// Context: on app launch, after both attach attempts fail (inspectExistingDaemon
// and resolveDaemonFromPort both returned null/non-ready), a process may still
// be holding the daemon port. Spawning a new daemon then makes the Go child
// collide on the port and exit 1. This helper encodes the decision: a non-null
// probe means a genuine AO daemon answered /healthz, so the caller should reuse
// it via the normal attach path. A null probe means nothing valid answered, so
// the caller should proceed to the replace path (kill any PID the run-file names,
// wait for the port to free, remove the stale run-file, then spawn fresh).
//
// Kept side-effect free and dependency-injected (no node:* or electron imports)
// so it can be exercised in vitest without the Electron polyfill layer.

import type { DaemonProbe } from "./daemon-attach";

/**
 * Decide what to do with whatever currently occupies the daemon port.
 *
 * Returns "reuse" when a valid AO daemon answered /healthz (probe non-null):
 * the caller should attach to it via the normal path.
 *
 * Returns "replace" when nothing valid answered (probe null): the caller should
 * kill any process the run-file names, wait for the port to free, clear the
 * stale run-file, then spawn a fresh daemon.
 *
 * ponytail: single null-check covers the entire decision surface; the probe's
 * content (pid, executablePath) is for the caller's identity checks, not ours.
 */
export function planDaemonTakeover(probe: DaemonProbe | null): "reuse" | "replace" {
	return probe !== null ? "reuse" : "replace";
}
