import { describe, expect, it } from "vitest";
import { assertAllowedAutomaticLegacyRuntimeFallback } from "../src/rpc/legacy-runtime-fallback-policy.js";

describe("automatic Legacy Runtime fallback policy", () => {
	it.each(["locked", "not-representable", "failed"] as const)(
		"allows the preserved %s session migration fallback",
		(status) => {
			expect(() =>
				assertAllowedAutomaticLegacyRuntimeFallback({
					reason: "legacy-session",
					sessionMigration: { status },
				}),
			).not.toThrow();
		},
	);

	it.each(["migrated", "reused"] as const)("rejects the successful %s migration status", (status) => {
		expect(() =>
			assertAllowedAutomaticLegacyRuntimeFallback({
				reason: "legacy-session",
				sessionMigration: { status },
			}),
		).toThrow(`Legacy Session fallback is not allowed after migration status ${status}`);
	});

	it("rejects a session fallback without migration evidence", () => {
		expect(() => assertAllowedAutomaticLegacyRuntimeFallback({ reason: "legacy-session" })).toThrow(
			"Legacy Session fallback requires migration evidence",
		);
	});

	it.each([
		{
			unsupportedEvents: ["future_event"],
			unmetRuntimeCapabilities: ["event-handler"],
		},
		{
			unsupportedEvents: [],
			unmetRuntimeCapabilities: ["command"],
		},
	] as const)("allows an Extension fallback with explicit compatibility evidence", (compatibility) => {
		expect(() =>
			assertAllowedAutomaticLegacyRuntimeFallback({
				reason: "legacy-extension",
				extensionCompatibility: { requiresLegacyRuntime: true, ...compatibility },
			}),
		).not.toThrow();
	});

	it("rejects an Extension fallback without an unmet compatibility gap", () => {
		expect(() =>
			assertAllowedAutomaticLegacyRuntimeFallback({
				reason: "legacy-extension",
				extensionCompatibility: {
					requiresLegacyRuntime: false,
					unsupportedEvents: [],
					unmetRuntimeCapabilities: [],
				},
			}),
		).toThrow("Legacy Extension fallback requires an explicit unsupported event or runtime capability gap");
	});
});
