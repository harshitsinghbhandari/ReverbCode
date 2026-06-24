// Pure decision helper for the wedged-orphan kill+replace path.
//
// Context: on app launch, after both attach attempts fail (inspectExistingDaemon
// and resolveDaemonFromPort both returned null/non-ready), a process may still
// be holding the daemon port. Spawning a new daemon then makes the Go child
// collide on the port and exit 1. This helper encodes the decision: kill the
// holder when something is provably holding the port, either because a process
// answered /healthz (probe non-null, already rejected by identity checks
// upstream) or because the run-file names a PID that is still alive (a hung
// holder that does not answer healthz but still binds the port). When neither
// holds, there is nothing to kill; skip straight to spawn.
//
// Kept side-effect free and dependency-injected (no node:* or electron imports)
// so it can be exercised in vitest without the Electron polyfill layer.

import type { DaemonProbe } from "./daemon-attach";

/**
 * Reports whether something is holding the daemon port that we must kill before
 * spawning. By the time it is called, the healthy-reuse attach paths have already
 * returned, so any holder here is one we could not attach to: a process answering
 * healthz that failed identity (probe non-null), or a hung holder that does not
 * answer but whose run-file PID is still alive.
 *
 * Returns true when the caller should kill the holder, wait for the port to
 * free, clear the stale run-file, then spawn a fresh daemon.
 *
 * Returns false when there is no detectable holder; spawn immediately.
 *
 * ponytail: two-condition OR covers the entire decision surface; the probe's
 * content (pid, executablePath) is for the caller's kill logic, not ours.
 */
export function shouldReplacePortHolder(probe: DaemonProbe | null, holderPidAlive: boolean): boolean {
	return probe !== null || holderPidAlive;
}
