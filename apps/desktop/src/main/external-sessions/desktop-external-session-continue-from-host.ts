import { randomUUID } from "node:crypto";
import { getDesktopConversationService } from "../conversations/desktop-conversation-service.js";
import { getSharedRuntime } from "../runtime.js";
import {
	createApplicationExternalBriefingCache,
	createDesktopExternalOriginSnapshotPorts,
	createDesktopExternalSessionContinueFrom,
	type DesktopExternalSessionContinueRequest,
	type ExistingImportedExternalSession,
	type ExternalSessionContinueResult,
	findDesktopImportedExternalSessions,
	generateDesktopExternalSessionBriefing,
	persistDesktopExternalSessionContinueSeed,
	pickLatestImportedSession,
	resolveDesktopContinueFromModelKey,
} from "./desktop-external-session-continue-from.js";
import { getDesktopExternalSessionFormat } from "./desktop-external-session-format.js";

export function getDesktopExternalSessionContinueFrom(): (
	request: DesktopExternalSessionContinueRequest,
) => Promise<ExternalSessionContinueResult> {
	desktopContinueFrom ??= createDesktopExternalSessionContinueFrom({
		files: getDesktopExternalSessionFormat().host,
		cache: createApplicationExternalBriefingCache(),
		findImportedSessions: (source) =>
			findDesktopImportedExternalSessions(source, {
				listProjects: async () => getSharedRuntime().listProjects(),
				listSessions: (cwd) => getDesktopConversationService().listSessions(cwd),
				samePath: getDesktopExternalSessionFormat().host.samePath,
			}),
		...createDesktopExternalOriginSnapshotPorts(),
		generateBriefing: generateDesktopExternalSessionBriefing,
		persistSeededSession: persistDesktopExternalSessionContinueSeed,
		resolveDefaultModelKey: resolveDesktopContinueFromModelKey,
		createSessionId: randomUUID,
	});
	return desktopContinueFrom;
}

let desktopContinueFrom: ReturnType<typeof createDesktopExternalSessionContinueFrom> | undefined;

export async function lookupDesktopExternalImport(
	sessionPath: string,
): Promise<ExistingImportedExternalSession | undefined> {
	return pickLatestImportedSession(
		await findDesktopImportedExternalSessions(
			{ path: sessionPath },
			{
				listProjects: async () => getSharedRuntime().listProjects(),
				listSessions: (cwd) => getDesktopConversationService().listSessions(cwd),
				samePath: getDesktopExternalSessionFormat().host.samePath,
			},
		),
	);
}
