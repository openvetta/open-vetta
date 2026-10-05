import { useCallback, useRef } from "react";

/** Async UI results belong to the route that admitted them, even after an A → B → A navigation. */
export function useTeamChatViewScope(input: {
	readonly teamId: string;
	readonly preferredSessionId?: string;
	readonly loadedSessionId?: string;
	readonly createNewSession: boolean;
}): () => boolean {
	const current = useRef({ ...input, token: Symbol("team-chat-view") });
	const previous = current.current;
	const canonicalizing =
		previous.preferredSessionId === undefined &&
		input.preferredSessionId !== undefined &&
		input.preferredSessionId === input.loadedSessionId;
	const sameView =
		previous.teamId === input.teamId &&
		(previous.preferredSessionId === input.preferredSessionId || canonicalizing) &&
		(!input.createNewSession || previous.createNewSession);
	current.current = { ...input, token: sameView ? previous.token : Symbol("team-chat-view") };
	const token = current.current.token;
	return useCallback(() => current.current.token === token, [token]);
}
