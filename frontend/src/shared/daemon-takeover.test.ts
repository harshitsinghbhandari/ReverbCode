// Unit tests for planDaemonTakeover. Run with:
//   cd frontend && npx vitest run src/shared/daemon-takeover.test.ts
import { describe, expect, it } from "vitest";
import { DAEMON_SERVICE_NAME, type DaemonProbe } from "./daemon-attach";
import { planDaemonTakeover } from "./daemon-takeover";

// A minimal valid DaemonProbe (non-null means the AO daemon answered /healthz).
const healthyProbe: DaemonProbe = {
	status: "ok",
	service: DAEMON_SERVICE_NAME,
	pid: 1234,
};

describe("planDaemonTakeover", () => {
	it("returns reuse when a valid probe answered (healthy daemon is live)", () => {
		expect(planDaemonTakeover(healthyProbe)).toBe("reuse");
	});

	it("returns reuse with optional identity fields present", () => {
		const probeWithIdentity: DaemonProbe = {
			...healthyProbe,
			executablePath: "/usr/local/bin/ao",
			workingDirectory: "/work/backend",
		};
		expect(planDaemonTakeover(probeWithIdentity)).toBe("reuse");
	});

	it("returns replace when probe is null (nothing valid answered the port)", () => {
		expect(planDaemonTakeover(null)).toBe("replace");
	});
});
