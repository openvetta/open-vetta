import {
	CAPABILITY_ERROR_CODES,
	CAPABILITY_LAYERS,
	type CapabilityExecutionContext,
	DOMAIN_PROJECT_CAPABILITIES,
	type FilesystemReadFileResult,
	FOUNDATION_FILESYSTEM_CAPABILITIES,
} from "@vetta/capability-sdk";
import { describe, expect, it } from "vitest";
import { bindCapability } from "../src/provider.js";
import { CapabilityRegistry } from "../src/registry.js";

const TEST_CAPABILITY = FOUNDATION_FILESYSTEM_CAPABILITIES.READ_FILE;

function context(): CapabilityExecutionContext {
	return { signal: new AbortController().signal, traceId: "test" };
}

describe("CapabilityRegistry", () => {
	it("keeps the previous provider when replacement validation fails", async () => {
		const registry = new CapabilityRegistry(CAPABILITY_LAYERS.FOUNDATION);
		registry.registerOwner("owner", [
			bindCapability(TEST_CAPABILITY, {
				execute: ({ path }) => ({
					content: `old:${path}`,
					encoding: "utf8",
				}),
			}),
		]);

		expect(() =>
			registry.registerOwner("owner", [
				bindCapability(DOMAIN_PROJECT_CAPABILITIES.LIST, {
					execute: () => ({
						projects: [],
						currentProjectPath: null,
					}),
				}),
			]),
		).toThrowError(expect.objectContaining({ code: CAPABILITY_ERROR_CODES.LAYER_MISMATCH }));
		await expect(registry.invoke(TEST_CAPABILITY, { path: "value" }, context())).resolves.toEqual({
			content: "old:value",
			encoding: "utf8",
		});
	});

	it("aborts in-flight invocations when an owner is replaced", async () => {
		const registry = new CapabilityRegistry(CAPABILITY_LAYERS.FOUNDATION);
		registry.registerOwner("owner", [
			bindCapability(TEST_CAPABILITY, {
				execute: (_input, executionContext) =>
					new Promise<FilesystemReadFileResult>((_resolve, reject) => {
						executionContext.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					}),
			}),
		]);
		const invocation = registry.invoke(TEST_CAPABILITY, { path: "value" }, context());

		registry.registerOwner("owner", [
			bindCapability(TEST_CAPABILITY, {
				execute: ({ path }) => ({
					content: `new:${path}`,
					encoding: "utf8",
				}),
			}),
		]);

		await expect(invocation).rejects.toMatchObject({ code: CAPABILITY_ERROR_CODES.ABORTED });
		await expect(registry.invoke(TEST_CAPABILITY, { path: "value" }, context())).resolves.toEqual({
			content: "new:value",
			encoding: "utf8",
		});
	});

	it("aborts in-flight invocations when a registration is disposed", async () => {
		const registry = new CapabilityRegistry(CAPABILITY_LAYERS.FOUNDATION);
		const registration = registry.registerOwner("owner", [
			bindCapability(TEST_CAPABILITY, {
				execute: (_input, executionContext) =>
					new Promise<FilesystemReadFileResult>((_resolve, reject) => {
						executionContext.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					}),
			}),
		]);
		const invocation = registry.invoke(TEST_CAPABILITY, { path: "value" }, context());

		registration.dispose();

		await expect(invocation).rejects.toMatchObject({ code: CAPABILITY_ERROR_CODES.ABORTED });
		expect(registry.has(TEST_CAPABILITY.id)).toBe(false);
	});
});
