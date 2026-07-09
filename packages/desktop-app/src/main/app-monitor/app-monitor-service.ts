import type { RuntimeHost, SessionEvent } from "../../../../runtime-core/src/index.js";
import { getAppLogger } from "../logger.js";
import { type AppMonitorData, createDefaultAppMonitorData } from "./app-monitor-data.js";
import { appMonitorStore } from "./app-monitor-store.js";

const ACTIVE_TIMEOUT_MS = 2 * 60 * 1000;
const FLUSH_INTERVAL_MS = 2 * 60 * 1000;
const log = getAppLogger("app-monitor");

export type MonitoredSessionKind = "interactive" | "batch" | "automation";

export interface KnowledgeBaseMonitorSnapshot {
	kbCount: number;
	totalSourceFiles: number;
	wikiPageCount: number;
}

export interface KnowledgeBaseProcessingUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costTotal: number;
}

class AppMonitorService {
	private data = createDefaultAppMonitorData();
	private initialized = false;
	private visible = false;
	private lastActivityAt = Date.now();
	private lastAccountedAt = Date.now();
	private revision = 0;
	private persistedRevision = 0;
	private flushTimer: ReturnType<typeof setInterval> | undefined;
	private flushPromise: Promise<void> | undefined;
	private readonly runtimeSubscriptions = new Map<string, () => void>();

	async initialize(): Promise<void> {
		if (this.initialized) return;
		try {
			this.data = await appMonitorStore.read();
		} catch (error) {
			log.warn("initialization failed, using in-memory defaults", error);
		}
		const now = Date.now();
		this.lastActivityAt = now;
		this.lastAccountedAt = now;
		this.initialized = true;
		this.flushTimer = setInterval(() => {
			void this.flush();
		}, FLUSH_INTERVAL_MS);
		this.flushTimer.unref?.();
	}

	setWindowVisible(visible: boolean): void {
		const now = Date.now();
		this.accountDuration(now);
		this.visible = visible;
		if (visible) this.lastActivityAt = now;
	}

	recordUserActivity(): void {
		const now = Date.now();
		this.accountDuration(now);
		this.lastActivityAt = now;
	}

	recordBatchProjectCreated(): void {
		this.mutate((data) => {
			data.batchTasks.projectsCreated += 1;
		});
	}

	recordBatchRunStarted(): void {
		this.mutate((data) => {
			data.batchTasks.runsStarted += 1;
		});
	}

	recordAutomationTaskCreated(): void {
		this.mutate((data) => {
			data.automationTasks.tasksCreated += 1;
		});
	}

	recordAutomationRunStarted(): void {
		this.mutate((data) => {
			data.automationTasks.runsStarted += 1;
		});
	}

	recordKnowledgeBaseManualScan(): void {
		this.mutate((data) => {
			data.knowledgeBase.manualScanCount += 1;
		});
	}

	recordKnowledgeBaseRetryFailed(): void {
		this.mutate((data) => {
			data.knowledgeBase.retryFailedCount += 1;
		});
	}

	recordKnowledgeBaseClearWiki(): void {
		this.mutate((data) => {
			data.knowledgeBase.clearWikiCount += 1;
		});
	}

	recordKnowledgeBaseFilesAdded(count: number): void {
		const normalized = normalizeDelta(count);
		if (normalized === 0) return;
		this.mutate((data) => {
			data.knowledgeBase.filesAdded += normalized;
		});
	}

	recordKnowledgeBaseFilesDeleted(count: number): void {
		const normalized = normalizeDelta(count);
		if (normalized === 0) return;
		this.mutate((data) => {
			data.knowledgeBase.filesDeleted += normalized;
		});
	}

	recordKnowledgeBaseProcessingRound(): void {
		this.mutate((data) => {
			data.knowledgeBase.processingRounds += 1;
		});
	}

	recordKnowledgeBaseProcessingUsage(usage: KnowledgeBaseProcessingUsage): void {
		this.mutate((data) => {
			data.knowledgeBase.processingInputTokens += normalizeDelta(usage.inputTokens);
			data.knowledgeBase.processingOutputTokens += normalizeDelta(usage.outputTokens);
			data.knowledgeBase.processingCacheReadTokens += normalizeDelta(usage.cacheReadTokens);
			data.knowledgeBase.processingCacheWriteTokens += normalizeDelta(usage.cacheWriteTokens);
			data.knowledgeBase.processingCostTotal += normalizeAmountDelta(usage.costTotal);
		});
	}

	recordKnowledgeBaseProcessingResult(filesProcessed: number, filesFailed: number): void {
		const processed = normalizeDelta(filesProcessed);
		const failed = normalizeDelta(filesFailed);
		if (processed === 0 && failed === 0) return;
		this.mutate((data) => {
			data.knowledgeBase.filesProcessed += processed;
			data.knowledgeBase.filesFailed += failed;
		});
	}

	recordKnowledgeBaseSnapshot(snapshot: KnowledgeBaseMonitorSnapshot): void {
		this.mutate((data) => {
			data.knowledgeBase.kbCount = normalizeDelta(snapshot.kbCount);
			data.knowledgeBase.totalSourceFiles = normalizeDelta(snapshot.totalSourceFiles);
			data.knowledgeBase.wikiPageCount = normalizeDelta(snapshot.wikiPageCount);
		});
	}

	getSnapshot(): AppMonitorData {
		this.accountDuration(Date.now());
		return structuredClone(this.data);
	}

	monitorSession(runtime: RuntimeHost, sessionId: string, kind: MonitoredSessionKind): void {
		this.mutate((data) => {
			data.sessions[kind] += 1;
		});
		if (this.runtimeSubscriptions.has(sessionId)) return;

		try {
			const unsubscribe = runtime.subscribe(sessionId, (event: SessionEvent) => {
				try {
					this.recordSessionEvent(event);
				} catch (error) {
					log.warn("runtime event recording failed", { sessionId, type: event.type }, error);
				}
			});
			this.runtimeSubscriptions.set(sessionId, unsubscribe);
		} catch (error) {
			log.warn("runtime subscription failed", { sessionId }, error);
		}
	}

	stopMonitoringSession(sessionId: string): void {
		const unsubscribe = this.runtimeSubscriptions.get(sessionId);
		if (!unsubscribe) return;
		try {
			unsubscribe();
		} catch (error) {
			log.warn("runtime unsubscribe failed", { sessionId }, error);
		}
		this.runtimeSubscriptions.delete(sessionId);
	}

	async flush(): Promise<void> {
		this.accountDuration(Date.now());
		if (this.revision === this.persistedRevision) return;
		if (this.flushPromise) {
			await this.flushPromise;
			if (this.revision !== this.persistedRevision) {
				await this.flush();
			}
			return;
		}

		const snapshot = structuredClone(this.data);
		const snapshotRevision = this.revision;
		this.flushPromise = appMonitorStore
			.write(snapshot)
			.then(() => {
				this.persistedRevision = Math.max(this.persistedRevision, snapshotRevision);
			})
			.catch((error: unknown) => {
				log.warn("periodic flush failed", error);
			})
			.finally(() => {
				this.flushPromise = undefined;
			});
		return this.flushPromise;
	}

	async shutdown(): Promise<void> {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = undefined;
		}
		for (const sessionId of [...this.runtimeSubscriptions.keys()]) {
			this.stopMonitoringSession(sessionId);
		}
		await this.flush();
	}

	private accountDuration(now: number): void {
		if (!this.initialized || now <= this.lastAccountedAt) return;
		const from = this.lastAccountedAt;
		this.lastAccountedAt = now;

		if (!this.visible) {
			this.addDuration("backgroundMs", now - from);
			return;
		}

		const activeUntil = this.lastActivityAt + ACTIVE_TIMEOUT_MS;
		const activeEnd = Math.min(now, Math.max(from, activeUntil));
		if (activeEnd > from) {
			this.addDuration("foregroundActiveMs", activeEnd - from);
		}
		if (now > activeEnd) {
			this.addDuration("foregroundInactiveMs", now - activeEnd);
		}
	}

	private addDuration(key: keyof AppMonitorData["durations"], durationMs: number): void {
		if (durationMs <= 0) return;
		this.mutate((data) => {
			data.durations[key] += durationMs;
		});
	}

	private recordSessionEvent(event: SessionEvent): void {
		this.mutate((data) => {
			switch (event.type) {
				case "session.lifecycle":
					if (event.phase === "turn_start") data.sessions.turns += 1;
					break;
				case "message.final":
					data.sessions.messages += 1;
					break;
				case "tool.start":
					data.tools.started += 1;
					break;
				case "tool.end":
					data.tools.completed += 1;
					if (event.isError) data.tools.failed += 1;
					data.tools.totalDurationMs += Math.max(0, event.durationMs);
					break;
				case "usage.update":
					data.usage.inputTokens += Math.max(0, event.input);
					data.usage.outputTokens += Math.max(0, event.output);
					data.usage.cacheReadTokens += Math.max(0, event.cacheRead);
					data.usage.cacheWriteTokens += Math.max(0, event.cacheWrite);
					data.usage.costTotal += Math.max(0, event.costTotal);
					break;
				case "compaction.start":
					data.compactions.started += 1;
					break;
				case "compaction.end":
					data.compactions[event.success ? "succeeded" : "failed"] += 1;
					break;
				case "error":
					data.errors[event.error.origin] += 1;
					break;
			}
		});
	}

	private mutate(update: (data: AppMonitorData) => void): void {
		try {
			update(this.data);
			this.data.updatedAt = Date.now();
			this.revision += 1;
		} catch (error) {
			log.warn("in-memory update failed", error);
		}
	}
}

const appMonitor = new AppMonitorService();

function normalizeDelta(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeAmountDelta(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

export function initializeAppMonitor(): Promise<void> {
	return appMonitor.initialize();
}

export function setAppMonitorWindowVisible(visible: boolean): void {
	appMonitor.setWindowVisible(visible);
}

export function recordAppMonitorUserActivity(): void {
	appMonitor.recordUserActivity();
}

export function recordBatchProjectCreated(): void {
	appMonitor.recordBatchProjectCreated();
}

export function recordBatchRunStarted(): void {
	appMonitor.recordBatchRunStarted();
}

export function recordAutomationTaskCreated(): void {
	appMonitor.recordAutomationTaskCreated();
}

export function recordAutomationRunStarted(): void {
	appMonitor.recordAutomationRunStarted();
}

export function recordKnowledgeBaseManualScan(): void {
	appMonitor.recordKnowledgeBaseManualScan();
}

export function recordKnowledgeBaseRetryFailed(): void {
	appMonitor.recordKnowledgeBaseRetryFailed();
}

export function recordKnowledgeBaseClearWiki(): void {
	appMonitor.recordKnowledgeBaseClearWiki();
}

export function recordKnowledgeBaseFilesAdded(count: number): void {
	appMonitor.recordKnowledgeBaseFilesAdded(count);
}

export function recordKnowledgeBaseFilesDeleted(count: number): void {
	appMonitor.recordKnowledgeBaseFilesDeleted(count);
}

export function recordKnowledgeBaseProcessingRound(): void {
	appMonitor.recordKnowledgeBaseProcessingRound();
}

export function recordKnowledgeBaseProcessingUsage(usage: KnowledgeBaseProcessingUsage): void {
	appMonitor.recordKnowledgeBaseProcessingUsage(usage);
}

export function recordKnowledgeBaseProcessingResult(filesProcessed: number, filesFailed: number): void {
	appMonitor.recordKnowledgeBaseProcessingResult(filesProcessed, filesFailed);
}

export function recordKnowledgeBaseSnapshot(snapshot: KnowledgeBaseMonitorSnapshot): void {
	appMonitor.recordKnowledgeBaseSnapshot(snapshot);
}

export function getAppMonitorSnapshot(): AppMonitorData {
	return appMonitor.getSnapshot();
}

export function monitorRuntimeSession(runtime: RuntimeHost, sessionId: string, kind: MonitoredSessionKind): void {
	appMonitor.monitorSession(runtime, sessionId, kind);
}

export function stopMonitoringRuntimeSession(sessionId: string): void {
	appMonitor.stopMonitoringSession(sessionId);
}

export function shutdownAppMonitor(): Promise<void> {
	return appMonitor.shutdown();
}
