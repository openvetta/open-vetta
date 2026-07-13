import { useState } from "react";
import { Input } from "../../../components/ui/input";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalFormField, ApprovalImpactCard, ApprovalRawFallback } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface InputData {
	operation: "set-binding";
	id: string;
	shortcut: string;
	approvalUi?: string;
}

function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-binding") return null;
	if (typeof r.id !== "string" || typeof r.shortcut !== "string") return null;
	return {
		operation: "set-binding",
		id: r.id,
		shortcut: r.shortcut,
		approvalUi: typeof r.approvalUi === "string" ? r.approvalUi : undefined,
	};
}

export function ShortcutsSetBindingApproval(): JSX.Element | null {
	const approval = useActionApproval("shortcuts.set-binding");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}

function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [id, setId] = useState(input?.id ?? "");
	const [shortcut, setShortcut] = useState(input?.shortcut ?? "");
	const icon = "icon-[mdi--keyboard-outline]";

	return (
		<Frame
			presentation="drawer"
			title={t("manageApproval.shortcuts.ops.set-binding.title")}
			summary={t("manageApproval.shortcuts.ops.set-binding.summary")}
			icon={icon}
			badge={t("manageApproval.shortcuts.ops.set-binding.badge")}
			labels={frameLabels(request.permission, t("manageApproval.shortcuts.ops.set-binding.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() =>
				input
					? approve({
							operation: "set-binding",
							id: id.trim(),
							shortcut: shortcut.trim(),
							approvalUi: input.approvalUi ?? "shortcuts.set-binding",
						})
					: approve()
			}
			canApprove={id.trim().length > 0 && shortcut.trim().length > 0}
		>
			{input ? (
				<>
					<ApprovalFormField id="shortcuts-action-id" label={t("manageApproval.fields.shortcutActionId")}>
						<Input id="shortcuts-action-id" value={id} onChange={(e) => setId(e.target.value)} />
					</ApprovalFormField>
					<ApprovalFormField id="shortcuts-combo" label={t("manageApproval.fields.shortcutCombo")}>
						<Input id="shortcuts-combo" value={shortcut} onChange={(e) => setShortcut(e.target.value)} />
					</ApprovalFormField>
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.shortcuts.ops.set-binding.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
