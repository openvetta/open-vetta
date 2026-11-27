import { describe, expect, it } from "vitest";
import { parseSpaceSyncRequest } from "./spaces.js";

describe("parseSpaceSyncRequest", () => {
	it("keeps a well-formed request", () => {
		expect(parseSpaceSyncRequest({ sourceId: " abc ", local: { spaces: [] }, localDirty: true })).toEqual({
			sourceId: "abc",
			local: { spaces: [] },
			localDirty: true,
		});
	});

	it("treats anything but true as clean and a missing local as empty", () => {
		expect(parseSpaceSyncRequest({ sourceId: "abc", localDirty: "yes" })).toEqual({
			sourceId: "abc",
			local: {},
			localDirty: false,
		});
	});

	it.each([undefined, {}, { sourceId: "" }, { sourceId: "  " }, { sourceId: 1 }])(
		"rejects a request without a source id: %p",
		(value) => {
			expect(() => parseSpaceSyncRequest(value)).toThrow("sourceId is required");
		},
	);
});
