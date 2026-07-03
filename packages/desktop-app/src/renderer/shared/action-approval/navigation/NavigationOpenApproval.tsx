import type { DesktopActionApprovalRequest } from "@preload/api.js";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useTranslation } from "react-i18next";
import { useActionApproval } from "../useActionApproval";
import { NavigationOpenApprovalView } from "./NavigationOpenApprovalView";

function isNavigationOpenInput(
	input: DesktopActionApprovalRequest["input"],
): input is { type: "open"; target: string; tab?: string; section?: string } {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
	const record = input as Record<string, unknown>;
	return record.type === "open" && typeof record.target === "string";
}

export function NavigationOpenApproval(): JSX.Element | null {
	const { t } = useTranslation("common");
	const approval = useActionApproval("navigation.open");
	const ThemedNavigationOpenApprovalView = useThemeComponent(
		"root.approval.navigationOpenView",
		NavigationOpenApprovalView,
	);
	if (!approval) return null;
	const { request, responding, error, approve, reject } = approval;

	const input = isNavigationOpenInput(request.input) ? request.input : null;
	const fields = input
		? [
				{ label: t("navigationApproval.target"), value: input.target },
				...(input.tab ? [{ label: t("navigationApproval.tab"), value: input.tab }] : []),
				...(input.section ? [{ label: t("navigationApproval.section"), value: input.section }] : []),
			]
		: [];

	return (
		<ThemedNavigationOpenApprovalView
			countdown={approval.countdown.formatted}
			error={error}
			fallbackJson={input ? null : JSON.stringify(request.input, null, 2)}
			fields={fields}
			labels={{
				confirm: t("navigationApproval.confirm"),
				permission: t("actionApproval.permissionPrefix"),
				reject: t("actionApproval.reject"),
				responding: t("navigationApproval.responding"),
				title: t("navigationApproval.title"),
			}}
			onApprove={() => approve()}
			onReject={reject}
			permission={request.permission}
			responding={responding}
			summary={request.summary}
		/>
	);
}
