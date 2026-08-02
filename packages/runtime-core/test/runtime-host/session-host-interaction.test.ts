import type { ExtensionUIContext } from "@vetta/coding-agent/extensions";
import { LegacyRuntimeSessionHostInteraction, type RuntimeSession } from "@vetta/coding-agent/runtime-host";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeSessionHostInteractionContext } from "../../src/index.js";

describe("LegacyRuntimeSessionHostInteraction", () => {
	it("adapts independent host interactions to the legacy extension UI context", async () => {
		let uiContext: ExtensionUIContext | undefined;
		const bindExtensions = vi.fn(async (options: { uiContext: ExtensionUIContext }): Promise<void> => {
			uiContext = options.uiContext;
		});
		const session = { bindExtensions } as unknown as RuntimeSession;
		const confirm = vi.fn(async () => true);
		const requestSandboxGrant = vi.fn(async () => "allow_once" as const);
		const hostContext: RuntimeSessionHostInteractionContext = { confirm, requestSandboxGrant };
		const interaction = new LegacyRuntimeSessionHostInteraction(session);

		await interaction.bind(hostContext);

		expect(bindExtensions).toHaveBeenCalledOnce();
		if (!uiContext) throw new Error("Expected a bound extension UI context");
		const signal = new AbortController().signal;
		expect(await uiContext.confirm("Confirm", "Continue?", { signal, timeout: 100 })).toBe(true);
		expect(confirm).toHaveBeenCalledWith("Confirm", "Continue?", signal);

		const grantRequest = {
			title: "Grant",
			message: "Allow access?",
			toolName: "read",
			capability: "file.read" as const,
			target: "relative.txt",
			resolvedTarget: "C:/workspace/relative.txt",
			grantRoot: "C:/workspace",
			sensitive: false,
		};
		expect(await uiContext.requestSandboxGrant?.(grantRequest)).toBe("allow_once");
		expect(requestSandboxGrant).toHaveBeenCalledWith(grantRequest);

		expect(await uiContext.select("Select", ["one"])).toBeUndefined();
		expect(await uiContext.input("Input")).toBeUndefined();
		expect(await uiContext.editor("Editor")).toBeUndefined();
		expect(uiContext.getEditorText()).toBe("");
		expect(uiContext.setTheme("default")).toEqual({
			success: false,
			error: "Desktop runtime theme switching is unavailable.",
		});
	});

	it("propagates legacy binding failures", async () => {
		const error = new Error("binding failed");
		const session = {
			bindExtensions: vi.fn(async () => {
				throw error;
			}),
		} as unknown as RuntimeSession;
		const interaction = new LegacyRuntimeSessionHostInteraction(session);
		const hostContext: RuntimeSessionHostInteractionContext = {
			confirm: async () => false,
			requestSandboxGrant: async () => "deny",
		};

		await expect(interaction.bind(hostContext)).rejects.toBe(error);
	});
});
