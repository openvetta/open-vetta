import type { UserMessage } from "@vetta/ai";
import type { TodoContinuationState } from "./contracts.js";

export interface TodoContinuationResult {
	messages: UserMessage[];
	nextNudgeSignature: string | undefined;
}

export function buildTodoContinuationMessages(
	state: TodoContinuationState,
	lastNudgeSignature: string | undefined,
	now: () => number = Date.now,
): TodoContinuationResult {
	const items = state.getAll();
	if (items.length === 0) return { messages: [], nextNudgeSignature: lastNudgeSignature };

	const pending = items.filter((item) => item.status !== "done").sort((left, right) => left.id - right.id);
	if (pending.length === 0) return { messages: [], nextNudgeSignature: lastNudgeSignature };

	const nextItem = pending[0];
	const pendingList = pending.map((item) => `  #${item.id} ${item.content}`).join("\n");
	const doneCount = items.length - pending.length;
	if (state.isLocked()) {
		return {
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `[ephemeral:todo] You have ${pending.length} uncompleted todo items (${doneCount}/${items.length} done). You MUST continue working on them before stopping.\n\nRemaining:\n${pendingList}\n\nYou MUST work on item #${nextItem.id} next: "${nextItem.content}"\nCall todo(action="update", id=${nextItem.id}, status="in_progress") first, then do the work, then mark it done. Do NOT skip to a later item.`,
						},
					],
					timestamp: now(),
				},
			],
			nextNudgeSignature: lastNudgeSignature,
		};
	}

	const signature = pending.map((item) => `${item.id}:${item.status}`).join(",");
	if (signature === lastNudgeSignature) return { messages: [], nextNudgeSignature: undefined };
	return {
		messages: [
			{
				role: "user",
				content: [
					{
						type: "text",
						text: `[ephemeral:todo] You still have ${pending.length} uncompleted todo items (${doneCount}/${items.length} done):\n${pendingList}\n\nIf this plan still applies, keep going — work on item #${nextItem.id} next ("${nextItem.content}"): call todo(action="update", id=${nextItem.id}, status="in_progress"). You may reprioritize freely.\nIf the user's latest request has superseded this plan, call todo(action="clear") to abandon it, then proceed with what the user actually wants.`,
					},
				],
				timestamp: now(),
			},
		],
		nextNudgeSignature: signature,
	};
}
