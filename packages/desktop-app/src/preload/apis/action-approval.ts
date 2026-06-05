import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const CHANNELS = {
	REQUEST: "vetta:action-approval:request",
	RESPONSE: "vetta:action-approval:response",
} as const;

export function createActionApprovalApi(ipc: IpcRenderer): Pick<DesktopApi, "actionApproval"> {
	return {
		actionApproval: {
			onRequest: (handler) => onIpcEvent(ipc, CHANNELS.REQUEST, handler),
			respond: (approvalId, approved, input) => ipc.invoke(CHANNELS.RESPONSE, approvalId, approved, input),
		},
	};
}
