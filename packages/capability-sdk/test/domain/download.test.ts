import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_DOWNLOAD_CAPABILITIES, DOWNLOAD_STATUSES } from "../../src/domain.js";

describe("download domain capabilities", () => {
	it("uses stable ids for listing and canceling downloads", () => {
		expect(Object.values(DOMAIN_DOWNLOAD_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}download.list`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}download.cancel`,
		]);
	});

	it("validates download inputs and outputs", () => {
		expect(DOMAIN_DOWNLOAD_CAPABILITIES.CANCEL.parseInput({ id: "download" })).toEqual({ id: "download" });
		expect(() => DOMAIN_DOWNLOAD_CAPABILITIES.CANCEL.parseInput({ id: "" })).toThrowError(
			expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_INPUT }),
		);
		expect(
			DOMAIN_DOWNLOAD_CAPABILITIES.LIST.parseOutput([
				{
					id: "download",
					url: "https://example.com/file",
					filename: "file",
					path: "C:/downloads/file",
					totalBytes: 10,
					receivedBytes: 5,
					status: DOWNLOAD_STATUSES.DOWNLOADING,
					createdAt: 1,
				},
			]),
		).toHaveLength(1);
		expect(() =>
			DOMAIN_DOWNLOAD_CAPABILITIES.LIST.parseOutput([
				{
					id: "download",
					url: "https://example.com/file",
					filename: "file",
					path: "C:/downloads/file",
					totalBytes: 10,
					receivedBytes: 5,
					status: "unknown",
					createdAt: 1,
				},
			]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});
