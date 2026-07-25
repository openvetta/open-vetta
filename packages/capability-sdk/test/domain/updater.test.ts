import { describe, expect, it } from "vitest";
import { CAPABILITY_ERROR_CODES, CAPABILITY_PREFIXES } from "../../src/contracts.js";
import { DOMAIN_UPDATER_CAPABILITIES, UPDATER_PHASES } from "../../src/domain.js";

describe("updater domain capabilities", () => {
	it("uses one stable id per updater operation", () => {
		expect(Object.values(DOMAIN_UPDATER_CAPABILITIES).map((capability) => capability.id)).toEqual([
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.state.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.current-version.get`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.check`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.download`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.install`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.dismiss`,
			`${CAPABILITY_PREFIXES.VETTA_DOMAIN}updater.cancel`,
		]);
	});

	it("validates updater states at the contract boundary", () => {
		expect(
			DOMAIN_UPDATER_CAPABILITIES.GET_STATE.parseOutput({
				phase: UPDATER_PHASES.DOWNLOADING,
				currentVersion: "1.0.0",
				latestVersion: "1.1.0",
				progress: 0.5,
				downloadedBytes: 5,
				totalBytes: 10,
				pendingInstall: false,
			}),
		).toEqual({
			phase: UPDATER_PHASES.DOWNLOADING,
			currentVersion: "1.0.0",
			latestVersion: "1.1.0",
			progress: 0.5,
			downloadedBytes: 5,
			totalBytes: 10,
			pendingInstall: false,
		});
		expect(() =>
			DOMAIN_UPDATER_CAPABILITIES.GET_STATE.parseOutput({
				phase: UPDATER_PHASES.DOWNLOADING,
				currentVersion: "1.0.0",
				progress: 2,
				pendingInstall: false,
			}),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.INVALID_OUTPUT }));
	});
});
