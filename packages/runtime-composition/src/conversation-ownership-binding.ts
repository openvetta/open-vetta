import type { ConversationOwnershipLease, ConversationOwnershipManager } from "@vetta/runtime-storage/conversation";

/**
 * 把可变的 Runtime Session 身份绑定到唯一的进程级所有权 Lease。
 *
 * rebind 始终先取得目标所有权，再释放来源所有权；目标获取失败时来源仍被持有。
 */
export class ConversationOwnershipBinding {
	private disposed = false;

	private constructor(
		private readonly manager: ConversationOwnershipManager,
		private lease: ConversationOwnershipLease,
	) {}

	static async acquire(
		manager: ConversationOwnershipManager,
		conversationPath: string,
	): Promise<ConversationOwnershipBinding> {
		return new ConversationOwnershipBinding(manager, await manager.acquire(conversationPath));
	}

	get conversationPath(): string {
		return this.lease.conversationPath;
	}

	async rebind(conversationPath: string): Promise<void> {
		if (this.disposed) throw new Error("Conversation ownership binding is disposed");
		const previous = this.lease;
		const next = await this.manager.acquire(conversationPath);
		try {
			await previous.release();
		} catch (error) {
			try {
				await next.release();
			} catch (cleanupError) {
				throw new AggregateError([error, cleanupError], "Failed to release source and target ownership");
			}
			throw error;
		}
		this.lease = next;
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		await this.lease.release();
	}
}
