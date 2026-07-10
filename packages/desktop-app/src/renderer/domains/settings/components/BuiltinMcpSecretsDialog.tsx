import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { InputField } from "./SettingsFormFields";
import type { BuiltinMcpPreset } from "../mcp/builtin-mcp-presets";

function openHelpUrl(url: string): void {
	void window.vetta.auth.openExternal(url);
}

/** 主跳转地址：优先预设总览页，否则取第一个带 helpUrl 的密钥字段 */
function resolvePrimaryHelpUrl(preset: BuiltinMcpPreset): string | undefined {
	if (preset.setupHelpUrl) return preset.setupHelpUrl;
	return preset.secrets?.find((field) => field.helpUrl)?.helpUrl;
}

export function BuiltinMcpSecretsDialog({
	open,
	preset,
	initialValues,
	saving,
	allowDefer,
	onOpenChange,
	onConfirm,
	onDefer,
}: {
	open: boolean;
	preset: BuiltinMcpPreset | null;
	initialValues?: Record<string, string>;
	saving?: boolean;
	/** 允许先添加、密钥稍后再填 */
	allowDefer?: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (values: Record<string, string>) => void;
	onDefer?: () => void;
}): JSX.Element | null {
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

	if (!preset) return null;

	const guide = preset.setupGuideKey ? t(preset.setupGuideKey) : "";
	const guideLines = guide
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const hasFields = fields.length > 0;
	const primaryHelpUrl = resolvePrimaryHelpUrl(preset);
	const lead = hasFields ? t("mcpPresets.secretsDialogLead") : t("mcpPresets.browserAuthDialogLead");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{t("mcpPresets.secretsDialogTitle", { name: t(preset.displayNameKey) })}
					</DialogTitle>
					<DialogDescription>{lead}</DialogDescription>
				</DialogHeader>

				{/* 步骤 1：一键打开官方获取页 */}
				{primaryHelpUrl && (
					<div className="rounded-xl border border-border/50 bg-primary/5 px-3.5 py-3">
						<div className="mb-2 text-[12px] font-medium text-foreground">
							{hasFields ? t("mcpPresets.stepOpenSite") : t("mcpPresets.stepOpenAuth")}
						</div>
						<p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
							{hasFields ? t("mcpPresets.stepOpenSiteHint") : t("mcpPresets.stepOpenAuthHint")}
						</p>
						<Button
							variant="primary"
							size="sm"
							className="w-full"
							onClick={() => openHelpUrl(primaryHelpUrl)}
						>
							<span className="icon-[mdi--open-in-new] h-3.5 w-3.5" />
							{hasFields ? t("mcpPresets.openKeyPage") : t("mcpPresets.openAuthPage")}
						</Button>
					</div>
				)}

				{/* 步骤说明：如何获取 */}
				{guideLines.length > 0 && (
					<div className="rounded-xl border border-border/50 bg-muted/40 px-3.5 py-3">
						<div className="mb-2 text-[12px] font-medium text-foreground">{t("mcpPresets.secretsHowTo")}</div>
						<ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">
							{guideLines.map((line) => (
								<li key={line}>{line}</li>
							))}
						</ol>
					</div>
				)}

				{/* 步骤 2：粘贴密钥 */}
				{hasFields && (
					<div className="flex flex-col gap-3">
						<div className="text-[12px] font-medium text-foreground">{t("mcpPresets.stepPasteKey")}</div>
						{fields.map((field) => (
							<div key={field.envKey}>
								<div className="mb-1 flex items-center justify-between gap-2">
									<label className="text-[11px] text-muted-foreground">
										{t(field.labelKey)}
										{field.required ? " *" : `（${t("optional")}）`}
									</label>
									{field.helpUrl && field.helpUrl !== primaryHelpUrl && (
										<button
											type="button"
											className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-primary hover:underline"
											onClick={() => openHelpUrl(field.helpUrl!)}
										>
											<span className="icon-[mdi--open-in-new] h-3 w-3" />
											{t("mcpPresets.getKey")}
										</button>
									)}
								</div>
								<InputField
									type={field.secret ? "password" : "text"}
									value={values[field.envKey] ?? ""}
									onChange={(value) => setValues((current) => ({ ...current, [field.envKey]: value }))}
									placeholder={field.placeholder}
								/>
							</div>
						))}
					</div>
				)}

				<p className="text-[11px] text-muted-foreground/80">{t("mcpPresets.secretsPrivacy")}</p>

				<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
					{allowDefer && onDefer && hasFields && (
						<Button variant="ghost" size="sm" onClick={onDefer} disabled={saving} className="sm:mr-auto">
							{t("mcpPresets.secretsDefer")}
						</Button>
					)}
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
						{t("cancel")}
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!canSubmit || saving}
						onClick={() => onConfirm(values)}
					>
						{saving ? t("saving") : hasFields ? t("mcpPresets.finishConnect") : t("mcpPresets.confirmAdd")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
