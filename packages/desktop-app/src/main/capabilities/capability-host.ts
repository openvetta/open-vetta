import { type CapabilityAccessAuditEvent, CapabilityAccessController, CapabilityHub } from "@vetta/capability-runtime";
import { ThemeCapabilityAdapter } from "@vetta/capability-sdk/internal/theme-adapter";
import { getAppLogger } from "../logger.js";
import { registerDesktopFoundationProviders } from "./foundation-providers.js";

const log = getAppLogger("capability-access");

export interface DesktopCapabilityHost {
	readonly access: CapabilityAccessController;
	readonly adapters: {
		readonly theme: ThemeCapabilityAdapter;
	};
	readonly hub: CapabilityHub;
	dispose(): void;
}

function auditCapabilityAccess(event: CapabilityAccessAuditEvent): void {
	log.debug("access decision", {
		capabilityId: event.capabilityId,
		decision: event.decision,
		reason: event.reason,
		sessionId: event.subject.sessionId,
		subjectId: event.subject.id,
	});
}

function createDesktopCapabilityHost(): DesktopCapabilityHost {
	const hub = new CapabilityHub();
	const foundationRegistration = registerDesktopFoundationProviders(hub.foundation);
	const access = new CapabilityAccessController(hub, { audit: auditCapabilityAccess });
	const themeAdapter = new ThemeCapabilityAdapter(access);
	return {
		access,
		adapters: Object.freeze({ theme: themeAdapter }),
		hub,
		dispose: () => {
			themeAdapter.dispose();
			foundationRegistration.dispose();
		},
	};
}

let desktopCapabilityHost: DesktopCapabilityHost | undefined;

export function getDesktopCapabilityHost(): DesktopCapabilityHost {
	desktopCapabilityHost ??= createDesktopCapabilityHost();
	return desktopCapabilityHost;
}
