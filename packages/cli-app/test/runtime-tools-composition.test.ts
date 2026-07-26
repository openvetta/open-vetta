import { describe, expect, it } from "vitest";
import { createCodingToolsRuntimeComposition } from "../src/runtime-tools-composition.js";

describe("CLI Runtime Tools Composition Root", () => {
	it("registers and compiles the default CLI coding tools without downloading", async () => {
		const calls: Array<{ readonly tool: "fd" | "rg"; readonly silent: boolean | undefined }> = [];
		const composition = createCodingToolsRuntimeComposition({
			cwd: "C:/workspace",
			ensureTool: async (tool, silent) => {
				calls.push({ tool, silent });
				return undefined;
			},
		});

		const compiled = await composition.compile();
		try {
			const provider = compiled.snapshot.modelCallProviders?.[0];
			if (!provider) throw new Error("expected coding tools model call provider");
			const contribution = await provider.contribute({
				profileId: composition.profile.id,
				signal: new AbortController().signal,
			});
			expect(contribution.tools?.map(({ name }) => name)).toEqual(["current_time", "glob", "grep", "read"]);
			await expect(composition.executableResolver.resolve("rg")).resolves.toBeUndefined();
			expect(calls).toEqual([{ tool: "rg", silent: true }]);
		} finally {
			await compiled.dispose();
		}
	});

	it("keeps fail-closed tools available for explicit activation", async () => {
		const composition = createCodingToolsRuntimeComposition({
			cwd: "C:/workspace",
			activation: {
				mode: "explicit",
				toolNames: ["find", "ls"],
			},
			ensureTool: async () => undefined,
		});

		const compiled = await composition.compile();
		try {
			const provider = compiled.snapshot.modelCallProviders?.[0];
			if (!provider) throw new Error("expected coding tools model call provider");
			const contribution = await provider.contribute({
				profileId: composition.profile.id,
				signal: new AbortController().signal,
			});
			expect(contribution.tools?.map(({ name }) => name)).toEqual(["find", "ls"]);
		} finally {
			await compiled.dispose();
		}
	});
});
