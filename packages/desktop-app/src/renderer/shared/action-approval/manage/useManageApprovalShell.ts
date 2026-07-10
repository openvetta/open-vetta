import { useThemeComponent } from "@vetta/theme-sdk";
import { useTranslation } from "react-i18next";
import { ManageActionApprovalFrameView } from "./ManageActionApprovalFrameView";

/** 领域审批外壳与 i18n；`useActionApproval` 必须只在外层 presenter 调用一次。 */
export function useManageApprovalFrame(): {
	Frame: typeof ManageActionApprovalFrameView;
	t: ReturnType<typeof useTranslation<"common">>["t"];
	frameLabels: (
		permission: string,
		confirm: string,
	) => {
		reject: string;
		confirm: string;
		responding: string;
		permission: string;
	};
} {
	const { t } = useTranslation("common");
	const Frame = useThemeComponent("root.approval.manageFrameView", ManageActionApprovalFrameView);
	return {
		Frame,
		t,
		frameLabels: (permission, confirm) => ({
			reject: t("actionApproval.reject"),
			confirm,
			responding: t("actionApproval.processing"),
			permission: t("actionApproval.permission", { permission }),
		}),
	};
}
