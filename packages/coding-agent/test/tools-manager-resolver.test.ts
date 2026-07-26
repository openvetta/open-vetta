import { describe, expect, it } from "vitest";
import { createToolExecutableResolver } from "../src/core/host/executable-resolver.js";

describe("legacy tool executable resolver adapter", () => {
	it("delegates resolution silently and preserves resolved paths", async () => {
		const calls: Array<{ readonly tool: "fd" | "rg"; readonly silent: boolean | undefined }> = [];
		const resolver = createToolExecutableResolver(async (tool, silent) => {
			calls.push({ tool, silent });
			return `${tool}-path`;
		});

		await expect(resolver.resolve("rg")).resolves.toBe("rg-path");
		await expect(resolver.resolve("fd")).resolves.toBe("fd-path");
		expect(calls).toEqual([
			{ tool: "rg", silent: true },
			{ tool: "fd", silent: true },
		]);
	});

	it("preserves unavailable tools as undefined", async () => {
		const resolver = createToolExecutableResolver(async () => undefined);

		await expect(resolver.resolve("rg")).resolves.toBeUndefined();
	});
});
