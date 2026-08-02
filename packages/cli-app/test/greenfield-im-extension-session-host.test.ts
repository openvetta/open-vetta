import type { RpcSessionInitialization } from "@vetta/coding-agent/rpc";
import type { CodingAgentGreenfieldExtensionEventHost } from "@vetta/coding-agent/runtime-host/greenfield";
import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import { describe, expect, it, vi } from "vitest";
import { GreenfieldImExtensionSessionHost } from "../src/rpc/greenfield-im-extension-session-host.js";

describe("GreenfieldImExtensionSessionHost initialization rollback", () => {
	it("continues reverse rollback and keeps the reload failure as the primary cause", async () => {
		const order: string[] = [];
		const initializationError = new Error("resource discovery failed");
		const cleanupError = new Error("next host cleanup failed");
		const previousRunner = {
			emit: vi.fn(async (event: { readonly type: string }) => {
				order.push(`previous:${event.type}`);
			}),
		};
		const previous = {
			runner: previousRunner,
			initialize: vi.fn(async () => undefined),
			discoverResources: vi.fn(async () => undefined),
			rebindRuntimeActions: vi.fn(() => order.push("previous:rebind-actions")),
			rebindRuntimeBindings: vi.fn(() => order.push("previous:rebind-bindings")),
			dispose: vi.fn(async () => undefined),
		} as unknown as CodingAgentGreenfieldExtensionEventHost;
		const next = {
			runner: {
				emit: vi.fn(async (event: { readonly type: string }) => {
					order.push(`next:${event.type}`);
				}),
			},
			initialize: vi.fn(async () => undefined),
			discoverResources: vi.fn(async () => {
				throw initializationError;
			}),
			dispose: vi.fn(async () => {
				order.push("next:dispose");
				throw cleanupError;
			}),
		} as unknown as CodingAgentGreenfieldExtensionEventHost;
		const host = new GreenfieldImExtensionSessionHost(previous, () => next);
		await host.initialize({
			uiContext: {} as RpcSessionInitialization["uiContext"],
			hostBridge: { sendAttachment: vi.fn(async () => ({})) },
			onShutdownRequested: vi.fn(),
			onExtensionError: vi.fn(),
		});
		order.length = 0;

		let caught: unknown;
		try {
			await host.reload({} as GreenfieldRuntimeSession, async () => undefined);
		} catch (error) {
			caught = error;
		}

		expect(order).toEqual([
			"previous:session_shutdown",
			"next:session_start",
			"next:dispose",
			"previous:rebind-bindings",
			"previous:session_start",
		]);
		expect(host.readRunner()).toBe(previousRunner);
		expect(caught).toMatchObject({
			message: "Greenfield Extension reload and rollback failed",
			cause: initializationError,
			errors: [initializationError, cleanupError],
		});
	});
});
