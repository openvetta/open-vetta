import { isAbsolute, relative, resolve, sep } from "node:path";

const GREENFIELD_CONVERSATION_SUFFIX = ".conversation.jsonl";

/** 解析 Coding Agent Greenfield Conversation 的持久化路径。 */
export function resolveGreenfieldSessionIdFromPath(conversationDir: string, sessionPath: string): string | undefined {
	const root = resolve(conversationDir);
	const path = resolve(sessionPath);
	const relativePath = relative(root, path);
	if (
		!relativePath ||
		isAbsolute(relativePath) ||
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		relativePath.includes(sep)
	) {
		return undefined;
	}
	if (!relativePath.endsWith(GREENFIELD_CONVERSATION_SUFFIX)) return undefined;
	const encoded = relativePath.slice(0, -GREENFIELD_CONVERSATION_SUFFIX.length);
	if (!encoded) return undefined;
	const sessionId = Buffer.from(encoded, "base64url").toString("utf8");
	if (!sessionId || Buffer.from(sessionId, "utf8").toString("base64url") !== encoded) {
		return undefined;
	}
	return sessionId;
}
