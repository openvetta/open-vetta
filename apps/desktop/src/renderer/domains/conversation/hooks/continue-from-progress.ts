export const CONTINUE_FROM_PROGRESS_STEPS = ["reading", "briefing", "creating"] as const;

export type ContinueFromProgressStep = (typeof CONTINUE_FROM_PROGRESS_STEPS)[number];

/** 各步开始出现的耗时。最后一步会一直停到提要完成。 */
const STEP_AFTER_MS = [0, 700, 2_800] as const;

export function continueFromProgressStepIndex(elapsedMs: number): number {
	const elapsed = Math.max(0, elapsedMs);
	let index = 0;
	for (let i = 0; i < STEP_AFTER_MS.length; i += 1) {
		if (elapsed >= STEP_AFTER_MS[i]) index = i;
	}
	return index;
}
