import {
	CAPABILITY_CONSTRAINT_KINDS,
	CAPABILITY_ERROR_CODES,
	createCapabilityGrant,
	FOUNDATION_STORAGE_CAPABILITIES,
} from "@vetta/capability-sdk";
import { describe, expect, it } from "vitest";
import { type CapabilityAccessAuditEvent, CapabilityAccessController } from "../src/access.js";
import { CapabilityHub } from "../src/hub.js";
import { bindCapability } from "../src/provider.js";

const NAMESPACED_CAPABILITY = FOUNDATION_STORAGE_CAPABILITIES.GET_ALL;

function createAccess(audit?: (event: CapabilityAccessAuditEvent) => void): CapabilityAccessController {
	const hub = new CapabilityHub();
	hub.foundation.registerOwner("test", [
		bindCapability(NAMESPACED_CAPABILITY, {
			execute: ({ namespace }) => ({ namespace }),
		}),
	]);
	return new CapabilityAccessController(hub, { audit });
}

describe("CapabilityAccessController", () => {
	it("requires an exact grant and enforces namespace constraints", async () => {
		const audit: CapabilityAccessAuditEvent[] = [];
		const access = createAccess((event) => audit.push(event));
		const handle = access.createSession({
			subject: { id: "subject", sessionId: "session" },
			grants: [
				createCapabilityGrant(NAMESPACED_CAPABILITY, {
					constraints: [{ kind: CAPABILITY_CONSTRAINT_KINDS.NAMESPACE, value: "allowed" }],
				}),
			],
		});

		await expect(handle.client.invoke(NAMESPACED_CAPABILITY, { namespace: "allowed" })).resolves.toEqual({
			namespace: "allowed",
		});
		await expect(handle.client.invoke(NAMESPACED_CAPABILITY, { namespace: "denied" })).rejects.toMatchObject({
			code: CAPABILITY_ERROR_CODES.INVALID_CONSTRAINT,
		});
		expect(audit.map(({ decision, reason }) => ({ decision, reason }))).toEqual([
			{ decision: "allow", reason: "granted" },
			{ decision: "deny", reason: "invalid-constraint" },
		]);
	});

	it("rejects revoked and expired sessions", async () => {
		const access = createAccess();
		const revoked = access.createSession({
			subject: { id: "subject", sessionId: "revoked" },
			grants: [createCapabilityGrant(NAMESPACED_CAPABILITY)],
		});
		revoked.revoke();

		await expect(revoked.client.invoke(NAMESPACED_CAPABILITY, { namespace: "value" })).rejects.toMatchObject({
			code: CAPABILITY_ERROR_CODES.SESSION_REVOKED,
		});

		const expired = access.createSession({
			subject: { id: "subject", sessionId: "expired" },
			grants: [createCapabilityGrant(NAMESPACED_CAPABILITY)],
			expiresAt: Date.now() - 1,
		});
		await expect(expired.client.invoke(NAMESPACED_CAPABILITY, { namespace: "value" })).rejects.toMatchObject({
			code: CAPABILITY_ERROR_CODES.SESSION_EXPIRED,
		});
	});
});
