import { useState } from "react";
import type { RuntimeEasyUseVettaAppRequest, RuntimeJsonValue } from "../../../../../../runtime-core/src/index.js";
import { Button } from "@shared/components/ui/button";

interface EasyUseVettaAppPanelProps {
	request: RuntimeEasyUseVettaAppRequest;
	onClose: () => void;
}

function defaultFieldValues(request: RuntimeEasyUseVettaAppRequest): Record<string, RuntimeJsonValue> {
	const values: Record<string, RuntimeJsonValue> = {};
	for (const field of request.fields ?? []) {
		if (field.defaultValue !== undefined) values[field.id] = field.defaultValue;
	}
	return values;
}

function buildUiOutput(
	request: RuntimeEasyUseVettaAppRequest,
	fieldValues: Record<string, RuntimeJsonValue>,
	input?: RuntimeJsonValue,
): RuntimeJsonValue {
	return {
		ui: {
			id: request.requestId,
			kind: request.ui.kind,
			component: request.ui.component ?? null,
		},
		action: {
			id: request.actionId,
			input: input ?? null,
		},
		values: fieldValues,
	};
}

function buildAllowedAction(request: RuntimeEasyUseVettaAppRequest): { actionId: string; input?: RuntimeJsonValue } {
	return {
		actionId: request.actionId,
		...(request.proposedInput !== undefined ? { input: request.proposedInput } : {}),
	};
}

export function EasyUseVettaAppPanel({ request, onClose }: EasyUseVettaAppPanelProps): JSX.Element {
	const [fieldValues, setFieldValues] = useState<Record<string, RuntimeJsonValue>>(() => defaultFieldValues(request));

	const finish = async (status: "approved" | "submitted" | "rejected" | "cancelled"): Promise<void> => {
		if (status === "approved" || status === "submitted") {
			await window.vetta.session.respondToEasyUseVettaApp(request.requestId, {
				status,
				message: status === "approved" ? "用户允许执行该 Vetta App action。" : "用户提交了 Vetta App UI 输出。",
				output: buildUiOutput(request, fieldValues, request.proposedInput),
				allowedActions: [buildAllowedAction(request)],
			});
			onClose();
			return;
		}

		await window.vetta.session.respondToEasyUseVettaApp(request.requestId, {
			status,
			message: status === "rejected" ? "用户拒绝执行该 Vetta App action。" : "用户取消了 Vetta App UI 请求。",
			output: buildUiOutput(request, fieldValues),
		});
		onClose();
	};

	return (
		<div className="absolute inset-0 z-40 flex items-end justify-center bg-background/50 px-4 pb-6 backdrop-blur-sm sm:items-center sm:pb-0">
			<div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-lg">
				<div className="border-b border-border px-4 py-3">
					<div className="flex items-center gap-2">
						<span className="icon-[mdi--application-cog-outline] size-4 text-primary" />
						<div className="min-w-0">
							<div className="truncate text-sm font-medium text-foreground">{request.ui.title}</div>
							<div className="truncate text-[11px] text-muted-foreground">{request.actionId}</div>
						</div>
					</div>
				</div>

				<div className="max-h-[70vh] space-y-3 overflow-auto px-4 py-3">
					<p className="text-sm leading-5 text-foreground">{request.ui.description}</p>
					<p className="text-xs leading-5 text-muted-foreground">{request.intent}</p>
					{request.ui.component && (
						<div className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
							组件提示：{request.ui.component}
						</div>
					)}

					{request.fields && request.fields.length > 0 && (
						<div className="space-y-2">
							<div className="text-xs font-medium text-muted-foreground">字段</div>
							{request.fields.map((field) => (
								<label key={field.id} className="block space-y-1">
									<span className="text-xs text-foreground">{field.label}</span>
									<input
										className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring"
										value={String(fieldValues[field.id] ?? "")}
										onChange={(event) =>
											setFieldValues((prev) => ({ ...prev, [field.id]: event.target.value }))
										}
									/>
									{field.description && <span className="block text-[11px] text-muted-foreground">{field.description}</span>}
								</label>
							))}
						</div>
					)}
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
					<Button variant="ghost" size="sm" onClick={() => void finish("rejected")}>
						{request.ui.cancelLabel ?? "拒绝"}
					</Button>
					<Button size="sm" onClick={() => void finish(request.ui.kind === "confirm" ? "approved" : "submitted")}>
						{request.ui.primaryLabel ?? (request.ui.kind === "confirm" ? "允许" : "提交")}
					</Button>
				</div>
			</div>
		</div>
	);
}
