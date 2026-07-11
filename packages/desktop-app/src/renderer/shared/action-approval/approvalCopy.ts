import type { TFunction } from "i18next";

/** 把 permission 码转成用户可读说明；未知码回落通用「为何需要确认」文案。 */
export function formatApprovalWhyConfirm(t: TFunction<"common">, _permission?: string): string {
	// 终端用户不需要看到 `settings.write` 这类实现级权限码。
	return t("actionApproval.whyConfirm");
}

/** 布尔值展示为「开启/关闭」而非 true/false。 */
export function formatApprovalBoolean(t: TFunction<"common">, value: boolean): string {
	return value ? t("manageApproval.on") : t("manageApproval.off");
}

/** 执行模式人话标签。 */
export function formatExecutionMode(t: TFunction<"common">, mode: string): string {
	if (mode === "sandbox") return t("manageApproval.settings.executionModeSandbox");
	if (mode === "full-access") return t("manageApproval.settings.executionModeFullAccess");
	return mode;
}

const EXPERIMENTAL_FIELD_KEYS = ["vettaCli", "promptPrediction", "agentSkills"] as const;
export type ExperimentalFieldKey = (typeof EXPERIMENTAL_FIELD_KEYS)[number];

export function isExperimentalFieldKey(key: string): key is ExperimentalFieldKey {
	return (EXPERIMENTAL_FIELD_KEYS as readonly string[]).includes(key);
}

export function experimentalFieldLabel(t: TFunction<"common">, key: string): string {
	if (key === "vettaCli") return t("manageApproval.settings.experimentalFields.vettaCli");
	if (key === "promptPrediction") return t("manageApproval.settings.experimentalFields.promptPrediction");
	if (key === "agentSkills") return t("manageApproval.settings.experimentalFields.agentSkills");
	return key;
}

const KB_FIELD_KEYS = [
	"enabled",
	"pollIntervalMinutes",
	"processingModelKey",
	"processingModelReasoningLevel",
	"agentConcurrency",
	"ocrConcurrency",
] as const;
export type KnowledgeBaseFieldKey = (typeof KB_FIELD_KEYS)[number];

export function knowledgeBaseFieldLabel(t: TFunction<"common">, key: string): string {
	const map: Record<string, string> = {
		enabled: t("manageApproval.settings.knowledgeFields.enabled"),
		pollIntervalMinutes: t("manageApproval.settings.knowledgeFields.pollIntervalMinutes"),
		processingModelKey: t("manageApproval.settings.knowledgeFields.processingModelKey"),
		processingModelReasoningLevel: t("manageApproval.settings.knowledgeFields.processingModelReasoningLevel"),
		agentConcurrency: t("manageApproval.settings.knowledgeFields.agentConcurrency"),
		ocrConcurrency: t("manageApproval.settings.knowledgeFields.ocrConcurrency"),
	};
	return map[key] ?? key;
}

/** 导航 target 人话；未知 id 原样返回。 */
export function navigationTargetLabel(t: TFunction<"common">, target: string): string {
	const key = `navigationApproval.targets.${target}` as const;
	const translated = t(key);
	// i18next 未命中时通常返回 key 本身
	if (translated === key || translated.startsWith("navigationApproval.targets.")) return target;
	return translated;
}
