import { randomUUID } from "node:crypto";
import type { WebContents } from "electron";
import { showMainWindow } from "../window-manager.js";
import {
	type ActionApprovalDecision,
	type ActionApprovalRequest,
	type ActionApprovalRequester,
	ActionError,
	type JsonValue,
} from "./types.js";

const ACTION_APPROVAL_REQUEST_CHANNEL = "vetta:action-approval:request";
const DEFAULT_APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;

export interface DesktopActionApprovalRequest extends ActionApprovalRequest {
	approvalId: string;
}

interface PendingApproval {
	finish: (decision: ActionApprovalDecision) => void;
	cancel: (error: ActionError) => void;
}

export class ActionApprovalBroker implements ActionApprovalRequester {
	private readonly pending = new Map<string, PendingApproval>();
	private readonly onRenderProcessGone = (): void => {
		this.cancelAll();
	};

	constructor(
		private readonly webContents: WebContents,
		private readonly timeoutMs = DEFAULT_APPROVAL_TIMEOUT_MS,
	) {
		this.webContents.on("render-process-gone", this.onRenderProcessGone);
	}

	request(request: ActionApprovalRequest, signal?: AbortSignal): Promise<ActionApprovalDecision> {
		if (this.webContents.isDestroyed()) {
			return Promise.reject(new ActionError("ACTION_APPROVAL_UNAVAILABLE", "Vetta Desktop 授权界面不可用。"));
		}

		const approvalId = randomUUID();
		return new Promise<ActionApprovalDecision>((resolve, reject) => {
			let settled = false;
			const cleanup = (): void => {
				this.pending.delete(approvalId);
				clearTimeout(timeout);
				signal?.removeEventListener("abort", onAbort);
			};
			const finish = (decision: ActionApprovalDecision): void => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(decision);
			};
			const cancel = (error: ActionError): void => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(error);
			};
			const onAbort = (): void => {
				cancel(new ActionError("ACTION_CANCELLED", "Vetta action 请求已取消。", { actionId: request.actionId }));
			};
			const timeout = setTimeout(() => {
				cancel(
					new ActionError("ACTION_APPROVAL_TIMEOUT", "等待用户授权 Vetta action 超时。", {
						actionId: request.actionId,
					}),
				);
			}, this.timeoutMs);

			if (signal?.aborted) {
				onAbort();
				return;
			}
			signal?.addEventListener("abort", onAbort, { once: true });
			this.pending.set(approvalId, { finish, cancel });
			showMainWindow();
			this.webContents.send(ACTION_APPROVAL_REQUEST_CHANNEL, { approvalId, ...request });
		});
	}

	respond(approvalId: string, approved: boolean, input?: JsonValue): boolean {
		const pending = this.pending.get(approvalId);
		if (!pending) return false;
		pending.finish(input === undefined ? { approved } : { approved, input });
		return true;
	}

	cancelAll(): void {
		for (const pending of this.pending.values()) {
			pending.cancel(new ActionError("ACTION_CANCELLED", "Vetta Desktop 授权请求已取消。"));
		}
		this.pending.clear();
	}

	dispose(): void {
		this.webContents.removeListener("render-process-gone", this.onRenderProcessGone);
		this.cancelAll();
	}
}
