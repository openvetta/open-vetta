import { describe, expect, it } from "vitest";
import { CONTINUE_FROM_PROGRESS_STEPS, continueFromProgressStepIndex } from "./continue-from-progress";

describe("continueFromProgressStepIndex", () => {
	it("starts on reading, then briefing, then creating, and stays on the last step", () => {
		expect(CONTINUE_FROM_PROGRESS_STEPS[continueFromProgressStepIndex(0)]).toBe("reading");
		expect(CONTINUE_FROM_PROGRESS_STEPS[continueFromProgressStepIndex(699)]).toBe("reading");
		expect(CONTINUE_FROM_PROGRESS_STEPS[continueFromProgressStepIndex(700)]).toBe("briefing");
		expect(CONTINUE_FROM_PROGRESS_STEPS[continueFromProgressStepIndex(2_799)]).toBe("briefing");
		expect(CONTINUE_FROM_PROGRESS_STEPS[continueFromProgressStepIndex(2_800)]).toBe("creating");
		expect(CONTINUE_FROM_PROGRESS_STEPS[continueFromProgressStepIndex(60_000)]).toBe("creating");
	});
});
