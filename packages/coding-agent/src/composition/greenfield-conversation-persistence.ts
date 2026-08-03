import type { ConversationDocumentStore } from "@vetta/runtime-core/conversation";
import type { ConversationContinuationStore, ConversationRepository } from "@vetta/runtime-core/kernel";
import { FileConversationRepository, InMemoryConversationRepository } from "@vetta/runtime-storage/conversation";

/** Composition 所需的完整 Conversation 持久化端口。 */
export interface GreenfieldConversationPersistence {
	readonly repository: ConversationRepository;
	readonly documentStore: ConversationDocumentStore;
	readonly continuationStore: ConversationContinuationStore;
	/** 供内部资源关联使用；内存实现可以返回虚拟地址。 */
	resolveConversationPath(sessionId: string): string;
	/** 对外暴露的可恢复会话路径；内存实现必须返回 undefined。 */
	resolveSessionPath(sessionId: string): string | undefined;
	dispose(): Promise<void>;
}

export interface GreenfieldConversationPersistenceFactoryContext {
	readonly conversationDir?: string;
}

export type GreenfieldConversationPersistenceFactory = (
	context: GreenfieldConversationPersistenceFactoryContext,
) => GreenfieldConversationPersistence | Promise<GreenfieldConversationPersistence>;

export function createFileGreenfieldConversationPersistence(
	conversationDir: string,
): GreenfieldConversationPersistence {
	const repository = new FileConversationRepository({ rootDir: conversationDir });
	return {
		repository,
		documentStore: repository,
		continuationStore: repository,
		resolveConversationPath: (sessionId) => repository.resolveConversationPath(sessionId),
		resolveSessionPath: (sessionId) => repository.resolveConversationPath(sessionId),
		dispose: () => repository.close(),
	};
}

export function createInMemoryGreenfieldConversationPersistence(): GreenfieldConversationPersistence {
	const repository = new InMemoryConversationRepository();
	return {
		repository,
		documentStore: repository,
		continuationStore: repository,
		resolveConversationPath: (sessionId) => repository.resolveConversationPath(sessionId),
		resolveSessionPath: () => undefined,
		dispose: () => repository.close(),
	};
}

export async function resolveGreenfieldConversationPersistence(options: {
	readonly conversationDir?: string;
	readonly createConversationPersistence?: GreenfieldConversationPersistenceFactory;
}): Promise<GreenfieldConversationPersistence> {
	if (options.createConversationPersistence) {
		return options.createConversationPersistence({ conversationDir: options.conversationDir });
	}
	const conversationDir = options.conversationDir?.trim();
	if (!conversationDir) {
		throw new Error("Greenfield Runtime requires conversationDir or createConversationPersistence");
	}
	return createFileGreenfieldConversationPersistence(conversationDir);
}
