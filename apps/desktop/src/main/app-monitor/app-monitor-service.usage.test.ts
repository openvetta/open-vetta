import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VETTA_HOME_ENV } from "@vetta/action-rpc";
import type { RuntimeHost, SessionEvent } from "@vetta/runtime-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Store paths are resolved at module load, so each case resets modules under its own VETTA_HOME. */
let home = "";
let previousHome: string | undefined;

beforeEach(async () => {
	previousHome = process.env[VETTA_HOME_ENV];
	home = await mkdtemp(join(tmpdir(), "vetta-usage-report-"));
	process.env[VETTA_HOME_ENV] = home;
	vi.resetModules();
});

afterEach(async () => {
	if (previousHome === undefined) delete process.env[VETTA_HOME_ENV];
	else process.env[VETTA_HOME_ENV] = previousHome;
	await rm(home, { recursive: true, force: true });
});

function createFakeRuntime(): { runtime: RuntimeHost; emit: (event: SessionEvent) => void } {
	const handlers: Array<(event: SessionEvent) => void> = [];
	const runtime = {
		subscribe: (_sessionId: string, handler: (event: SessionEvent) => void) => {
			handlers.push(handler);
			return () => undefined;
		},
	} as unknown as RuntimeHost;
	return {
		runtime,
		emit: (event) => {
			for (const handler of handlers) handler(event);
		},
	};
}

function usageEvent(
	sessionId: string,
	model: { provider: string; id: string },
	input: number,
	output: number,
): SessionEvent {
	return {
		schemaVersion: 1,
		sessionId,
		eventId: `${sessionId}-${input}`,
		timestamp: Date.now(),
		source: "agent",
		type: "usage.update",
		input,
		output,
		cacheRead: 0,
		cacheWrite: 0,
		model: { api: "messages", ...model },
		costTotal: 0,
		contextPercent: null,
		contextWindow: 0,
	} as SessionEvent;
}

describe("用量报表：会话产生用量后在设置页读到", () => {
	it("实时会话按模型汇总，已归档的旧月份只有总数时显示为未区分模型", async () => {
		const service = await import("./app-monitor-service.js");
		await service.initializeAppMonitor();
		// Written after init: first-run file migrations clear the months directory.
		await mkdir(join(home, "app-monitor", "months"), { recursive: true });
		await writeFile(
			join(home, "app-monitor", "months", "2025-03.json"),
			JSON.stringify({
				schemaVersion: 1,
				month: "2025-03",
				days: {
					"2025-03-14": {
						bucketStartUtc: Date.UTC(2025, 2, 13, 16),
						bucketEndUtc: Date.UTC(2025, 2, 14, 16),
						data: { usage: { inputTokens: 900, outputTokens: 100 } },
					},
				},
			}),
		);

		const { runtime, emit } = createFakeRuntime();
		service.monitorRuntimeSession(runtime, "s1", "interactive");
		emit(usageEvent("s1", { provider: "anthropic", id: "claude-opus" }, 120, 30));
		emit(usageEvent("s1", { provider: "anthropic", id: "claude-opus" }, 80, 20));
		emit(usageEvent("s1", { provider: "openai", id: "gpt-5" }, 10, 5));

		const report = await service.getAppMonitorUsageReport();
		await service.shutdownAppMonitor();

		const today = report.days.find((day) => day.day === report.today);
		expect(today?.bySeries["anthropic/claude-opus"]).toMatchObject({
			inputTokens: 200,
			outputTokens: 50,
			requests: 2,
		});
		expect(today?.bySeries["openai/gpt-5"]).toMatchObject({ inputTokens: 10, requests: 1 });
		expect(today?.totals).toMatchObject({ inputTokens: 210, outputTokens: 55, requests: 3 });
		expect(today?.hourlyTokens?.reduce((sum, value) => sum + value, 0)).toBe(265);

		const archived = report.days.find((day) => day.day === "2025-03-14");
		expect(archived?.totals).toMatchObject({ inputTokens: 900, outputTokens: 100 });
		expect(report.series.find((entry) => entry.kind === "unattributed")).toBeDefined();
		expect(report.days[0]?.day).toBe("2025-03-14");
	});
});
