import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BuiltinMcpPreset } from "../mcp/builtin-mcp-presets";

function resolvePrimaryHelpUrl(preset: BuiltinMcpPreset): string | undefined {
	if (preset.setupHelpUrl) return preset.setupHelpUrl;
	return preset.secrets?.find((field) => field.helpUrl)?.helpUrl;
}

export interface BuiltinMcpSecretsFieldView {
	readonly envKey: string;
	readonly helpUrl?: string;
	readonly label: string;
	readonly optionalSuffix: string;
	readonly placeholder?: string;
	readonly required: boolean;
	readonly secret: boolean;
}

export interface BuiltinMcpSecretsDialogModel {
	readonly allowDefer: boolean;
	readonly canSubmit: boolean;
	readonly fields: readonly BuiltinMcpSecretsFieldView[];
	readonly guideLines: readonly string[];
	readonly hasFields: boolean;
	readonly labels: {
		readonly cancel: string;
		readonly confirmAdd: string;
		readonly defer: string;
		readonly finishConnect: string;
		readonly getKey: string;
		readonly howTo: string;
		readonly lead: string;
		readonly openAuthPage: string;
		readonly openKeyPage: string;
		readonly privacy: string;
		readonly saving: string;
		readonly stepOpenAuth: string;
		readonly stepOpenAuthHint: string;
		readonly stepOpenSite: string;
		readonly stepOpenSiteHint: string;
		readonly stepPasteKey: string;
		readonly title: string;
	};
	readonly onChangeValue: (envKey: string, value: string) => void;
	readonly onOpenHelp: (url: string) => void;
	readonly open: boolean;
	readonly primaryHelpUrl?: string;
	readonly saving: boolean;
	readonly values: Record<string, string>;
}

export function useBuiltinMcpSecretsDialogModel({
	open,
	preset,
	initialValues,
	saving = false,
	allowDefer = false,
}: {
	open: boolean;
	preset: BuiltinMcpPreset | null;
	initialValues?: Record<string, string>;
	saving?: boolean;
	allowDefer?: boolean;
}): BuiltinMcpSecretsDialogModel | null {
	const { t } = useTranslation("settings");
	const fields = preset?.secrets ?? [];
	const [values, setValues] = useState<Record<string, string>>({});

	useEffect(() => {
		if (!open || !preset) return;
		const next: Record<string, string> = {};
		for (const field of preset.secrets ?? []) {
			next[field.envKey] = initialValues?.[field.envKey] ?? "";
		}
		setValues(next);
	}, [initialValues, open, preset]);

	const canSubmit = useMemo(() => {
		return fields.every((field) => {
			if (!field.required) return true;
			return Boolean(values[field.envKey]?.trim());
		});
	}, [fields, values]);

	return useMemo(() => {
		if (!preset) return null;
		const guide = preset.setupGuideKey ? t(preset.setupGuideKey) : "";
		const guideLines = guide
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		const hasFields = fields.length > 0;
		return {
			allowDefer,
			canSubmit,
			fields: fields.map((field) => ({
				envKey: field.envKey,
				helpUrl: field.helpUrl,
				label: t(field.labelKey),
				optionalSuffix: `（${t("optional")}）`,
				placeholder: field.placeholder,
				required: Boolean(field.required),
				secret: Boolean(field.secret),
			})),
			guideLines,
			hasFields,
			labels: {
				cancel: t("cancel"),
				confirmAdd: t("mcpPresets.confirmAdd"),
				defer: t("mcpPresets.secretsDefer"),
				finishConnect: t("mcpPresets.finishConnect"),
				getKey: t("mcpPresets.getKey"),
				howTo: t("mcpPresets.secretsHowTo"),
				lead: hasFields ? t("mcpPresets.secretsDialogLead") : t("mcpPresets.browserAuthDialogLead"),
				openAuthPage: t("mcpPresets.openAuthPage"),
				openKeyPage: t("mcpPresets.openKeyPage"),
				privacy: t("mcpPresets.secretsPrivacy"),
				saving: t("saving"),
				stepOpenAuth: t("mcpPresets.stepOpenAuth"),
				stepOpenAuthHint: t("mcpPresets.stepOpenAuthHint"),
				stepOpenSite: t("mcpPresets.stepOpenSite"),
				stepOpenSiteHint: t("mcpPresets.stepOpenSiteHint"),
				stepPasteKey: t("mcpPresets.stepPasteKey"),
				title: t("mcpPresets.secretsDialogTitle", { name: t(preset.displayNameKey) }),
			},
			onChangeValue: (envKey: string, value: string) => {
				setValues((current) => ({ ...current, [envKey]: value }));
			},
			onOpenHelp: (url: string) => {
				void window.vetta.auth.openExternal(url);
			},
			open,
			primaryHelpUrl: resolvePrimaryHelpUrl(preset),
			saving,
			values,
		};
	}, [allowDefer, canSubmit, fields, open, preset, saving, t, values]);
}
