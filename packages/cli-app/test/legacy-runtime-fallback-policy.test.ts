import { describe, expect, it } from "vitest";
import { assertAllowedAutomaticLegacyRuntimeFallback } from "../src/rpc/legacy-runtime-fallback-policy.js";

describe("automatic Legacy Runtime fallback policy", () => {
	it("allows only an unrepresentable session migration fallback", () => {
		expect(() =>
			assertAllowedAutomaticLegacyRuntimeFallback({
				reason: "legacy-session",
				sessionMigration: { status: "not-representable" },
			}),
		).not.toThrow();
	});

	it.each(["locked", "failed", "migrated", "reused"] as const)(
		"rejects the non-fallback %s migration status",
		(status) => {
			expect(() =>
				assertAllowedAutomaticLegacyRuntimeFallback({
					reason: "legacy-session",
					sessionMigration: { status },
				}),
			).toThrow(`Legacy Session fallback is not allowed after migration status ${status}`);
		},
	);

	it("rejects a session fallback without migration evidence", () => {
		expect(() => assertAllowedAutomaticLegacyRuntimeFallback({ reason: "legacy-session" })).toThrow(
			"Legacy Session fallback requires migration evidence",
		);
	});
});
