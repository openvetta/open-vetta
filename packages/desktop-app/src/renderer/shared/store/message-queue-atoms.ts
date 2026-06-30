import type { PromptRequest } from "@vetta/runtime-core";
import { atom } from "jotai";

export interface QueuedMessage {
	id: string;
	request: PromptRequest;
	displayText: string;
}

/**
 * streaming 期间排队的消息，按 session 的 runtimeId 隔离。
 * 纯内存，无持久化，app 重启清空。
 * Map<runtimeId, QueuedMessage[]>
 */
export const messageQueueBySessionAtom = atom<Map<string, QueuedMessage[]>>(new Map());

export function getQueueForSession(
	map: Map<string, QueuedMessage[]>,
	runtimeId: string | null | undefined,
): QueuedMessage[] {
	if (!runtimeId) return [];
	return map.get(runtimeId) ?? [];
}

export const enqueueMessageAtom = atom(
	null,
	(get, set, { runtimeId, item }: { runtimeId: string; item: QueuedMessage }) => {
		const prev = get(messageQueueBySessionAtom);
		const next = new Map(prev);
		next.set(runtimeId, [...(prev.get(runtimeId) ?? []), item]);
		set(messageQueueBySessionAtom, next);
	},
);

export const dequeueHeadAtom = atom(null, (get, set, runtimeId: string): QueuedMessage | null => {
	const prev = get(messageQueueBySessionAtom);
	const queue = prev.get(runtimeId);
	if (!queue || queue.length === 0) return null;
	const [head, ...rest] = queue;
	const next = new Map(prev);
	if (rest.length === 0) next.delete(runtimeId);
	else next.set(runtimeId, rest);
	set(messageQueueBySessionAtom, next);
	return head;
});

export const removeQueuedMessageAtom = atom(null, (get, set, { runtimeId, id }: { runtimeId: string; id: string }) => {
	const prev = get(messageQueueBySessionAtom);
	const queue = prev.get(runtimeId);
	if (!queue) return;
	const rest = queue.filter((item) => item.id !== id);
	const next = new Map(prev);
	if (rest.length === 0) next.delete(runtimeId);
	else next.set(runtimeId, rest);
	set(messageQueueBySessionAtom, next);
});

export const setQueueForSessionAtom = atom(
	null,
	(get, set, { runtimeId, items }: { runtimeId: string; items: QueuedMessage[] }) => {
		const prev = get(messageQueueBySessionAtom);
		const next = new Map(prev);
		if (items.length === 0) next.delete(runtimeId);
		else next.set(runtimeId, items);
		set(messageQueueBySessionAtom, next);
	},
);

export const clearQueueAtom = atom(null, (get, set, runtimeId: string) => {
	const prev = get(messageQueueBySessionAtom);
	if (!prev.has(runtimeId)) return;
	const next = new Map(prev);
	next.delete(runtimeId);
	set(messageQueueBySessionAtom, next);
});
