import {
	clipFinalText,
	emptyUsage,
	isValidTaskName,
	type SubagentChildHandle,
	type SubagentCoordinatorOptions,
	type SubagentCoordinatorPort,
	type SubagentDeliveryMarker,
	type SubagentRecoveryState,
	type SubagentSnapshot,
	type SubagentSpawnRequest,
	type SubagentStatus,
	type SubagentTypeDefinition,
	type SubagentTypeId,
	type SubagentWaitOptions,
	type SubagentWaitResult,
	taskPath,
} from "./contracts.js";
import { buildSubagentNotification, SubagentDeliveryTracker } from "./notifications.js";

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;
const MIN_WAIT_TIMEOUT_MS = 1_000;
const MAX_WAIT_TIMEOUT_MS = 300_000;
const DEFAULT_NOTIFICATION_DELAY_MS = 50;
const MAX_TERMINAL_HANDLES = 50;
const MAX_STOP_CONTINUATIONS = 8;

type MutableSnapshot = {
	-readonly [K in keyof SubagentSnapshot]: SubagentSnapshot[K];
};

interface InternalChild {
	snapshot: MutableSnapshot;
	handle?: SubagentChildHandle;
	unsubscribe?: () => void;
	todoUnsubscribe?: () => void;
	holdsActiveSlot: boolean;
	waiters: Array<() => void>;
	queuedRequest?: SubagentSpawnRequest;
	startLifecycleCompleted: boolean;
	stopContinuationCount: number;
	endInFlight: boolean;
}

export class SubagentCoordinator<TProfile = unknown> implements SubagentCoordinatorPort {
	private readonly children = new Map<string, InternalChild>();
	private readonly byTaskName = new Map<string, string>();
	private readonly queue: string[] = [];
	private readonly delivery = new SubagentDeliveryTracker();
	private readonly clock: { now(): number };
	private readonly idGenerator: { next(): string };
	private readonly maxConcurrent: number;
	private readonly notificationDelayMs: number;
	private notifyBuffer: SubagentSnapshot[] = [];
	private notifyTimer?: ReturnType<typeof setTimeout>;
	private disposed = false;

	constructor(private readonly options: SubagentCoordinatorOptions<TProfile>) {
		this.clock = options.clock ?? { now: () => Date.now() };
		this.idGenerator = options.idGenerator ?? {
			next: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
		};
		this.maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
		if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) {
			throw new Error("Subagent maxConcurrent must be a positive integer");
		}
		this.notificationDelayMs = options.notificationDelayMs ?? DEFAULT_NOTIFICATION_DELAY_MS;
	}

	list(): readonly SubagentSnapshot[] {
		return [...this.children.values()]
			.map((entry) => cloneSnapshot(entry.snapshot))
			.sort((left, right) => left.startedAt - right.startedAt);
	}

	get(target: string): SubagentSnapshot | undefined {
		const entry = this.resolveChild(target);
		return entry ? cloneSnapshot(entry.snapshot) : undefined;
	}

	restore(state: SubagentRecoveryState): readonly SubagentSnapshot[] {
		this.assertNotDisposed();
		if (this.children.size > 0) throw new Error("SubagentCoordinator recovery requires an empty coordinator");
		const restored = this.validateRecoveryState(state);
		for (const snapshot of restored) {
			const entry: InternalChild = {
				snapshot,
				holdsActiveSlot: false,
				waiters: [],
				startLifecycleCompleted: snapshot.sessionFile !== undefined,
				stopContinuationCount: 0,
				endInFlight: false,
			};
			this.children.set(snapshot.id, entry);
			this.byTaskName.set(snapshot.taskName, snapshot.id);
		}
		this.delivery.restore(state.delivered);
		this.emitUpdate();
		return this.list();
	}

	registeredTypeIds(): readonly SubagentTypeId[] {
		return this.options.typeRegistry.ids();
	}

	typeDocs(): string {
		return this.options.typeRegistry.describeForTools();
	}

	clearFinished(): number {
		if (this.disposed) return 0;
		let removed = 0;
		for (const [id, entry] of [...this.children]) {
			if (!isTerminalStatus(entry.snapshot.status)) continue;
			this.disposeHandle(entry);
			this.children.delete(id);
			this.byTaskName.delete(entry.snapshot.taskName);
			removed += 1;
		}
		if (removed > 0) this.emitUpdate();
		return removed;
	}

	async spawn(request: SubagentSpawnRequest): Promise<SubagentSnapshot> {
		this.assertNotDisposed();
		const taskName = this.validateRequest(request);
		const activeCount = this.countActive();
		if (activeCount >= this.maxConcurrent) {
			throw new Error(
				`Too many active subagents (${activeCount}/${this.maxConcurrent}). Wait or interrupt one before spawning more.`,
			);
		}
		const entry = this.reserve(request, taskName, "pending");
		this.emitUpdate();
		try {
			await this.startChild(entry);
			this.emitUpdate();
			return cloneSnapshot(entry.snapshot);
		} catch (error) {
			if (!isTerminalStatus(entry.snapshot.status)) {
				this.releaseEntry(entry, "failed", errorMessage(error));
			}
			this.emitUpdate();
			this.drainQueue();
			throw error;
		}
	}

	spawnMany(requests: readonly SubagentSpawnRequest[]): readonly SubagentSnapshot[] {
		this.assertNotDisposed();
		if (requests.length === 0) throw new Error("dispatch requires at least one workflow");

		const requestedTypes = new Set(requests.map((request) => request.agentType));
		const reusableTaskNames = new Set(
			[...this.children.values()]
				.filter(
					(entry) =>
						requestedTypes.has(entry.snapshot.agentType) &&
						(entry.snapshot.status === "completed" || entry.snapshot.status === "failed"),
				)
				.map((entry) => entry.snapshot.taskName),
		);
		const seen = new Set<string>();
		const validated = requests.map((request) => {
			const taskName = this.validateRequest(request, reusableTaskNames);
			if (seen.has(taskName)) {
				throw new Error(`Duplicate task_name "${taskName}" in this dispatch`);
			}
			seen.add(taskName);
			return { request, taskName };
		});

		this.clearCompletedByTypes(requestedTypes);
		const entries = validated.map(({ request, taskName }) => {
			const hasSlot = this.countActive() < this.maxConcurrent;
			const entry = this.reserve(request, taskName, hasSlot ? "pending" : "queued");
			if (hasSlot) void this.startChildInBackground(entry);
			else this.queue.push(entry.snapshot.id);
			return entry;
		});
		this.emitUpdate();
		return entries.map((entry) => cloneSnapshot(entry.snapshot));
	}

	async sendMessage(target: string, message: string): Promise<SubagentSnapshot> {
		this.assertNotDisposed();
		const entry = this.requireChild(target);
		if (!message.trim()) throw new Error("message must be non-empty");
		if (!entry.handle) throw new Error(`Subagent "${target}" has no live session`);
		await entry.handle.sendMessage(message);
		return cloneSnapshot(entry.snapshot);
	}

	async followUp(target: string, message: string): Promise<SubagentSnapshot> {
		this.assertNotDisposed();
		const entry = this.requireChild(target);
		if (!message.trim()) throw new Error("message must be non-empty");
		const type = this.requireType(entry.snapshot.agentType);
		if (!entry.handle) {
			try {
				await this.reopen(entry, type);
			} catch (error) {
				this.releaseEntry(entry, "failed", `Unable to reopen subagent: ${errorMessage(error)}`);
				this.emitUpdate();
				this.queueNotification(entry.snapshot);
				throw error;
			}
		}

		if (isTerminalStatus(entry.snapshot.status)) {
			if (this.countActive() >= this.maxConcurrent) {
				throw new Error(`Too many active subagents (${this.maxConcurrent} max)`);
			}
			entry.holdsActiveSlot = true;
			entry.snapshot.status = "running";
			entry.snapshot.task = message;
			entry.snapshot.endedAt = undefined;
			entry.snapshot.errorMessage = undefined;
			entry.endInFlight = false;
			this.emitUpdate();
			void this.runFollowUp(entry, message);
			return cloneSnapshot(entry.snapshot);
		}

		if (!entry.handle) throw new Error(`Subagent "${target}" has no live session`);
		await entry.handle.followUp(message);
		entry.snapshot.task = message;
		this.emitUpdate();
		return cloneSnapshot(entry.snapshot);
	}

	interrupt(target: string): SubagentSnapshot {
		this.assertNotDisposed();
		const entry = this.requireChild(target);
		if (isTerminalStatus(entry.snapshot.status)) return cloneSnapshot(entry.snapshot);
		const finalText = entry.handle?.getLastAssistantText();
		entry.handle?.abort();
		entry.queuedRequest = undefined;
		entry.snapshot.finalText = finalText ?? entry.snapshot.finalText;
		entry.snapshot.status = "interrupted";
		entry.snapshot.endedAt = this.clock.now();
		entry.snapshot.generation += 1;
		this.updateUsage(entry);
		this.releaseActiveSlot(entry);
		this.wakeWaiters(entry);
		this.emitUpdate();
		this.queueNotification(entry.snapshot);
		this.drainQueue();
		void this.runTerminalStopLifecycle(entry, true);
		return cloneSnapshot(entry.snapshot);
	}

	async wait(options: SubagentWaitOptions = {}): Promise<SubagentWaitResult> {
		this.assertNotDisposed();
		const timeoutMs = clamp(options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS, MIN_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS);
		const resolveTargets = (): InternalChild[] => {
			if (!options.targets || options.targets.length === 0) {
				return [...this.children.values()].filter(
					(entry) => !isTerminalStatus(entry.snapshot.status) || this.hasUndelivered(entry),
				);
			}
			return options.targets.map((target) => this.requireChild(target));
		};
		const collectReady = (): SubagentSnapshot[] => {
			const ready: SubagentSnapshot[] = [];
			for (const entry of resolveTargets()) {
				if (!isTerminalStatus(entry.snapshot.status)) continue;
				if (!this.delivery.tryClaim(entry.snapshot.id, entry.snapshot.generation)) continue;
				this.emitDeliveryClaimed(entry.snapshot);
				ready.push({
					...cloneSnapshot(entry.snapshot),
					finalText: clipFinalText(entry.snapshot.finalText),
				});
			}
			return ready;
		};
		const immediate = collectReady();
		if (immediate.length > 0) return { timedOut: false, agents: immediate };
		const active = resolveTargets().filter((entry) => !isTerminalStatus(entry.snapshot.status));
		if (active.length === 0) return { timedOut: false, agents: [] };

		return new Promise((resolve) => {
			let settled = false;
			let timer: ReturnType<typeof setTimeout>;
			const finish = (timedOut: boolean) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				for (const entry of active) {
					const index = entry.waiters.indexOf(onWake);
					if (index >= 0) entry.waiters.splice(index, 1);
				}
				resolve({ timedOut, agents: collectReady() });
			};
			const onWake = () => {
				const ready = resolveTargets().some(
					(entry) => isTerminalStatus(entry.snapshot.status) && this.hasUndelivered(entry),
				);
				if (ready) finish(false);
			};
			for (const entry of active) entry.waiters.push(onWake);
			timer = setTimeout(() => finish(true), timeoutMs);
		});
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		if (this.notifyTimer) clearTimeout(this.notifyTimer);
		this.notifyTimer = undefined;
		this.notifyBuffer = [];
		this.queue.length = 0;
		const disposals: Promise<void>[] = [];
		for (const entry of this.children.values()) {
			if (!isTerminalStatus(entry.snapshot.status)) {
				entry.handle?.abort();
				entry.snapshot.status = "interrupted";
				entry.snapshot.endedAt = this.clock.now();
				entry.snapshot.generation += 1;
			}
			this.releaseActiveSlot(entry);
			this.wakeWaiters(entry);
			const disposal = this.disposeHandle(entry);
			if (disposal) disposals.push(disposal);
		}
		await Promise.allSettled(disposals);
		this.emitUpdate();
	}

	private validateRequest(request: SubagentSpawnRequest, reusableTaskNames: ReadonlySet<string> = new Set()): string {
		const taskName = request.taskName.trim();
		if (!isValidTaskName(taskName)) {
			throw new Error(
				`Invalid task_name "${request.taskName}". Use lowercase letters, digits, underscore; start with a letter; not "root".`,
			);
		}
		if (!request.message.trim()) throw new Error("message must be non-empty");
		this.requireType(request.agentType);
		if (this.byTaskName.has(taskName) && !reusableTaskNames.has(taskName)) {
			throw new Error(`task_name "${taskName}" is already used in this session`);
		}
		return taskName;
	}

	private reserve(request: SubagentSpawnRequest, taskName: string, status: "pending" | "queued"): InternalChild {
		const id = `pending-${taskName}-${this.idGenerator.next()}`;
		const snapshot: MutableSnapshot = {
			id,
			taskName,
			path: taskPath(taskName),
			agentType: request.agentType,
			status,
			task: request.message,
			parentSessionId: this.options.parentSessionId,
			startedAt: this.clock.now(),
			usage: emptyUsage(),
			generation: 0,
			title: request.title?.trim() || undefined,
			todoProgress: request.todos ? { done: 0, total: request.todos.length } : undefined,
		};
		const entry: InternalChild = {
			snapshot,
			holdsActiveSlot: status === "pending",
			waiters: [],
			queuedRequest: request,
			startLifecycleCompleted: false,
			stopContinuationCount: 0,
			endInFlight: false,
		};
		this.children.set(id, entry);
		this.byTaskName.set(taskName, id);
		return entry;
	}

	private async startChild(entry: InternalChild): Promise<void> {
		const request = entry.queuedRequest;
		if (!request) throw new Error(`Subagent "${entry.snapshot.taskName}" has no queued request`);
		const type = this.requireType(entry.snapshot.agentType);
		entry.queuedRequest = undefined;
		const handle = await this.options.factory.create(request, type);
		if (this.disposed) {
			await handle.dispose();
			throw new Error("Parent session disposed during subagent spawn");
		}
		this.attachHandle(entry, handle);
		handle.setTodos?.(request.todos ?? []);

		const lifecycle = await this.options.lifecycle?.beforeStart?.({
			id: entry.snapshot.id,
			agentType: entry.snapshot.agentType,
			message: request.message,
		});
		if (lifecycle?.blockedReason) {
			this.releaseEntry(entry, "failed", lifecycle.blockedReason);
			throw new SubagentStartBlockedError(lifecycle.blockedReason);
		}
		entry.startLifecycleCompleted = true;
		void this.runInitialPrompt(entry, lifecycle?.message ?? request.message);
	}

	private attachHandle(entry: InternalChild, handle: SubagentChildHandle): void {
		const provisionalId = entry.snapshot.id;
		this.children.delete(provisionalId);
		entry.snapshot.id = handle.sessionId;
		entry.snapshot.sessionFile = handle.sessionFile;
		entry.handle = handle;
		this.children.set(handle.sessionId, entry);
		this.byTaskName.set(entry.snapshot.taskName, handle.sessionId);
		entry.unsubscribe = handle.subscribe((event) => {
			if (event.type === "agent_start" && entry.snapshot.status === "pending") {
				entry.snapshot.status = "running";
				this.emitUpdate();
			}
			if (event.type === "agent_end") void this.onChildAgentEnd(entry);
		});
		if (handle.getTodoProgress) {
			entry.snapshot.todoProgress = handle.getTodoProgress();
			entry.todoUnsubscribe = handle.subscribeTodos?.((progress) => {
				entry.snapshot.todoProgress = progress;
				this.emitUpdate();
			});
		}
	}

	private async reopen(entry: InternalChild, type: SubagentTypeDefinition<TProfile>): Promise<void> {
		const reopen = this.options.factory.reopen;
		if (!reopen) throw new Error(`Subagent "${entry.snapshot.id}" is not live and reopen is not supported`);
		const handle = await reopen(cloneSnapshot(entry.snapshot), type);
		this.attachHandle(entry, handle);
	}

	private async runInitialPrompt(entry: InternalChild, message: string): Promise<void> {
		const handle = entry.handle;
		if (!handle) return;
		try {
			entry.snapshot.status = "running";
			this.emitUpdate();
			await handle.prompt(this.wrapTaskMessage(entry.snapshot, message));
			if (!handle.isStreaming() && entry.snapshot.status === "running") {
				await this.onChildAgentEnd(entry);
			}
		} catch (error) {
			if (isActiveStatus(entry.snapshot.status)) {
				this.releaseEntry(entry, "failed", errorMessage(error));
				this.emitUpdate();
				this.queueNotification(entry.snapshot);
				this.drainQueue();
			}
		}
	}

	private async runFollowUp(entry: InternalChild, message: string): Promise<void> {
		try {
			await entry.handle?.prompt(message);
			if (entry.handle && !entry.handle.isStreaming() && entry.snapshot.status === "running") {
				await this.onChildAgentEnd(entry);
			}
		} catch (error) {
			this.releaseEntry(entry, "failed", errorMessage(error));
			this.emitUpdate();
			this.queueNotification(entry.snapshot);
			this.drainQueue();
		}
	}

	private async onChildAgentEnd(entry: InternalChild): Promise<void> {
		if (isTerminalStatus(entry.snapshot.status) || entry.endInFlight) return;
		entry.endInFlight = true;
		try {
			entry.snapshot.finalText = entry.handle?.getLastAssistantText();
			this.updateUsage(entry);
			const lifecycle = entry.startLifecycleCompleted
				? await this.options.lifecycle?.beforeStop?.({
						id: entry.snapshot.id,
						agentType: entry.snapshot.agentType,
						generation: entry.snapshot.generation,
						stopHookActive: entry.stopContinuationCount > 0,
						lastAssistantText: entry.snapshot.finalText,
						sessionFile: entry.snapshot.sessionFile,
						interrupted: false,
					})
				: undefined;
			if (lifecycle?.continuation && entry.handle && entry.stopContinuationCount < MAX_STOP_CONTINUATIONS) {
				entry.stopContinuationCount += 1;
				entry.endInFlight = false;
				void this.runFollowUp(entry, lifecycle.continuation);
				return;
			}
			entry.snapshot.status = "completed";
			entry.snapshot.endedAt = this.clock.now();
			entry.snapshot.generation += 1;
			this.releaseActiveSlot(entry);
			this.trimTerminalHandles();
			this.wakeWaiters(entry);
			this.emitUpdate();
			this.queueNotification(entry.snapshot);
			this.drainQueue();
		} finally {
			entry.endInFlight = false;
		}
	}

	private async runTerminalStopLifecycle(entry: InternalChild, interrupted: boolean): Promise<void> {
		if (!entry.startLifecycleCompleted) return;
		await this.options.lifecycle
			?.beforeStop?.({
				id: entry.snapshot.id,
				agentType: entry.snapshot.agentType,
				generation: entry.snapshot.generation,
				stopHookActive: entry.stopContinuationCount > 0,
				lastAssistantText: entry.snapshot.finalText,
				sessionFile: entry.snapshot.sessionFile,
				interrupted,
			})
			.catch(() => undefined);
	}

	private startChildInBackground(entry: InternalChild): Promise<void> {
		return this.startChild(entry).catch((error) => {
			if (this.disposed) return;
			if (!isTerminalStatus(entry.snapshot.status)) {
				this.releaseEntry(entry, "failed", errorMessage(error));
			}
			this.emitUpdate();
			this.queueNotification(entry.snapshot);
			this.drainQueue();
		});
	}

	private clearCompletedByTypes(types: ReadonlySet<SubagentTypeId>): void {
		for (const [id, entry] of [...this.children]) {
			if (!types.has(entry.snapshot.agentType)) continue;
			if (entry.snapshot.status !== "completed" && entry.snapshot.status !== "failed") continue;
			this.disposeHandle(entry);
			this.children.delete(id);
			this.byTaskName.delete(entry.snapshot.taskName);
		}
	}

	private drainQueue(): void {
		if (this.disposed) return;
		while (this.queue.length > 0 && this.countActive() < this.maxConcurrent) {
			const id = this.queue.shift();
			if (!id) return;
			const entry = this.children.get(id);
			if (!entry || entry.snapshot.status !== "queued") continue;
			entry.snapshot.status = "pending";
			entry.holdsActiveSlot = true;
			this.emitUpdate();
			void this.startChildInBackground(entry);
		}
	}

	private releaseEntry(entry: InternalChild, status: "failed" | "interrupted", errorMessageText?: string): void {
		entry.snapshot.finalText = entry.handle?.getLastAssistantText() ?? entry.snapshot.finalText;
		entry.snapshot.status = status;
		entry.snapshot.endedAt = this.clock.now();
		entry.snapshot.errorMessage = errorMessageText;
		entry.snapshot.generation += 1;
		entry.queuedRequest = undefined;
		this.updateUsage(entry);
		this.releaseActiveSlot(entry);
		this.wakeWaiters(entry);
		this.disposeHandle(entry);
		void this.runTerminalStopLifecycle(entry, status === "interrupted");
	}

	private updateUsage(entry: InternalChild): void {
		const usage = entry.handle?.readUsage?.();
		if (usage) entry.snapshot.usage = { ...usage };
	}

	private disposeHandle(entry: InternalChild): Promise<void> | undefined {
		entry.unsubscribe?.();
		entry.todoUnsubscribe?.();
		entry.unsubscribe = undefined;
		entry.todoUnsubscribe = undefined;
		const handle = entry.handle;
		entry.handle = undefined;
		if (!handle) return undefined;
		try {
			return Promise.resolve(handle.dispose());
		} catch {
			return undefined;
		}
	}

	private trimTerminalHandles(): void {
		const terminal = [...this.children.values()]
			.filter((entry) => isTerminalStatus(entry.snapshot.status) && entry.handle)
			.sort((left, right) => (left.snapshot.endedAt ?? 0) - (right.snapshot.endedAt ?? 0));
		while (terminal.length > MAX_TERMINAL_HANDLES) {
			const entry = terminal.shift();
			if (entry) this.disposeHandle(entry);
		}
	}

	private queueNotification(snapshot: SubagentSnapshot): void {
		if (this.disposed || !this.options.onNotify) return;
		if (this.delivery.isDelivered(snapshot.id, snapshot.generation)) return;
		this.notifyBuffer.push(cloneSnapshot(snapshot));
		if (this.notifyTimer) return;
		this.notifyTimer = setTimeout(() => {
			this.notifyTimer = undefined;
			this.flushNotifications();
		}, this.notificationDelayMs);
	}

	private flushNotifications(): void {
		const notify = this.options.onNotify;
		if (this.disposed || !notify) {
			this.notifyBuffer = [];
			return;
		}
		const batch = this.notifyBuffer
			.filter((snapshot) => {
				if (!this.delivery.tryClaim(snapshot.id, snapshot.generation)) return false;
				this.emitDeliveryClaimed(snapshot);
				return true;
			})
			.map((snapshot) => ({
				...cloneSnapshot(snapshot),
				finalText: clipFinalText(snapshot.finalText),
			}));
		this.notifyBuffer = [];
		if (batch.length > 0) notify(buildSubagentNotification(batch));
	}

	private countActive(): number {
		return [...this.children.values()].filter(
			(entry) => entry.holdsActiveSlot && isActiveStatus(entry.snapshot.status),
		).length;
	}

	private hasUndelivered(entry: InternalChild): boolean {
		return (
			isTerminalStatus(entry.snapshot.status) &&
			!this.delivery.isDelivered(entry.snapshot.id, entry.snapshot.generation)
		);
	}

	private releaseActiveSlot(entry: InternalChild): void {
		entry.holdsActiveSlot = false;
	}

	private wakeWaiters(entry: InternalChild): void {
		for (const waiter of entry.waiters.splice(0)) waiter();
	}

	private resolveChild(target: string): InternalChild | undefined {
		const direct = this.children.get(target);
		if (direct) return direct;
		const taskName = target.startsWith("/root/") ? target.slice("/root/".length) : target;
		const id = this.byTaskName.get(taskName);
		return id ? this.children.get(id) : undefined;
	}

	private requireChild(target: string): InternalChild {
		const entry = this.resolveChild(target);
		if (!entry) throw new Error(`Subagent "${target}" not found`);
		return entry;
	}

	private requireType(agentType: string): SubagentTypeDefinition<TProfile> {
		const type = this.options.typeRegistry.get(agentType);
		if (!type) {
			const known = this.options.typeRegistry.ids().join(", ") || "(none)";
			throw new Error(`Unknown agent_type "${agentType}". Registered: ${known}`);
		}
		return type;
	}

	private wrapTaskMessage(snapshot: SubagentSnapshot, message: string): string {
		return [
			"<subagent_task>",
			`id: ${snapshot.id}`,
			`path: ${snapshot.path}`,
			`type: ${snapshot.agentType}`,
			`task_name: ${snapshot.taskName}`,
			"</subagent_task>",
			"",
			message,
		].join("\n");
	}

	private emitUpdate(): void {
		this.options.onUpdate?.(this.list());
	}

	private emitDeliveryClaimed(snapshot: Pick<SubagentSnapshot, "generation" | "id">): void {
		const marker: SubagentDeliveryMarker = {
			id: snapshot.id,
			generation: snapshot.generation,
		};
		this.options.onDeliveryClaimed?.(marker);
	}

	private validateRecoveryState(state: SubagentRecoveryState): MutableSnapshot[] {
		const ids = new Set<string>();
		const taskNames = new Set<string>();
		return state.agents.map((source) => {
			if (ids.has(source.id)) throw new Error(`Duplicate recovered subagent id "${source.id}"`);
			if (taskNames.has(source.taskName)) {
				throw new Error(`Duplicate recovered subagent task_name "${source.taskName}"`);
			}
			if (source.parentSessionId !== this.options.parentSessionId) {
				throw new Error(
					`Recovered subagent "${source.id}" belongs to parent "${source.parentSessionId}", not "${this.options.parentSessionId}"`,
				);
			}
			if (!isValidTaskName(source.taskName) || source.path !== taskPath(source.taskName)) {
				throw new Error(`Recovered subagent "${source.id}" has an invalid task identity`);
			}
			ids.add(source.id);
			taskNames.add(source.taskName);
			const snapshot: MutableSnapshot = cloneSnapshot(source);
			if (!isTerminalStatus(snapshot.status)) {
				snapshot.status = snapshot.sessionFile ? "interrupted" : "failed";
				snapshot.endedAt = this.clock.now();
				snapshot.generation += 1;
				snapshot.errorMessage = snapshot.sessionFile
					? "Parent runtime restarted while the subagent was active"
					: "Parent runtime restarted before the child session was created";
			}
			return snapshot;
		});
	}

	private assertNotDisposed(): void {
		if (this.disposed) throw new Error("SubagentCoordinator is disposed");
	}
}

function isActiveStatus(status: SubagentStatus): boolean {
	return status === "pending" || status === "running";
}

function isTerminalStatus(status: SubagentStatus): boolean {
	return status === "completed" || status === "failed" || status === "interrupted";
}

function cloneSnapshot(snapshot: SubagentSnapshot): SubagentSnapshot {
	return {
		...snapshot,
		usage: { ...snapshot.usage },
		todoProgress: snapshot.todoProgress ? { ...snapshot.todoProgress } : undefined,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

class SubagentStartBlockedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SubagentStartBlockedError";
	}
}
