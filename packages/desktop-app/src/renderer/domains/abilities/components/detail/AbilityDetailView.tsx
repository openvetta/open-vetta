import { Button } from "@vetta/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveAbilityDetailContent } from "../../lib/ability-presentation";
import type { AbilitiesModel, AbilityItem } from "../../types";
import { AbilityMcpDialogs } from "../AbilityMcpDialogs";
import { AbilityDetailHeader } from "./AbilityDetailHeader";
import { AbilityMarkdownBody } from "./AbilityMarkdownBody";
import { AbilityMetaList } from "./AbilityMetaList";
import { AbilityShowcaseList } from "./AbilityShowcaseList";
import { BundleMembersSection } from "./BundleMembersSection";
import { BundleUninstallDialog } from "./BundleUninstallDialog";
import { McpAbilitySection } from "./McpAbilitySection";
import { PluginAbilitySection } from "./PluginAbilitySection";

/** 通用壳层 + markdown 正文 + showcases + type 专属区块。 */
export function AbilityDetailView({
	item,
	model,
	onBack,
}: {
	item: AbilityItem;
	model: AbilitiesModel;
	onBack: () => void;
}): JSX.Element {
	const { t, i18n } = useTranslation("abilities");
	// raw.detail.i18n[locale] 覆盖块的取值语言，与界面语言一致。
	const language = i18n.language;
	const [bundleDialogOpen, setBundleDialogOpen] = useState(false);

	const detail = useMemo(
		() => resolveAbilityDetailContent(item.market?.detail, language),
		[item.market?.detail, language],
	);

	const handlePrimary = (): void => {
		if (!item.installed || item.needsUpdate) {
			model.install(item);
			return;
		}
		if (item.type === "mcp" && item.setupRequired) {
			model.setup(item);
			return;
		}
		if (!item.enabled) model.toggle(item);
	};

	const handleSecondary = (kind: "disable" | "configure" | "remove"): void => {
		if (kind === "disable") {
			if (item.enabled) model.toggle(item);
			return;
		}
		if (kind === "configure" && item.type === "mcp") {
			if (item.canConfigure) model.configure(item);
			else if (item.usesOAuth) {
				if (item.authorized) model.revokeAuthorization(item);
				else model.setup(item);
			}
			return;
		}
		if (kind === "remove") {
			if (item.type === "bundle") {
				setBundleDialogOpen(true);
				return;
			}
			model.uninstall(item);
			onBack();
		}
	};

	return (
		<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
			<div className="shrink-0 px-8 pb-2">
				<Button variant="ghost" size="sm" onClick={onBack}>
					<span className="icon-[solar--alt-arrow-left-linear] h-3.5 w-3.5" />
					{t("detail.back")}
				</Button>
			</div>

			<div className="flex-1 overflow-y-auto px-8 pb-10 [scrollbar-gutter:stable]">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-7">
					<AbilityDetailHeader item={item} onPrimary={handlePrimary} onSecondary={handleSecondary} />

					{model.errors.length > 0 ? (
						<div className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground/70">
							{t("error.partial", { error: model.errors.join(" / ") })}
						</div>
					) : null}

					<AbilityShowcaseList
						showcases={detail.showcases}
						fallbackBrandIconUrl={item.icon}
						fallbackBrandName={item.title}
					/>

					{detail.content ? (
						<AbilityMarkdownBody content={detail.content} />
					) : (
						<p className="text-[13px] leading-relaxed text-muted-foreground">{t("detail.noContent")}</p>
					)}

					<AbilityMetaList meta={detail.meta} />

					{item.type === "plugin" ? <PluginAbilitySection item={item} model={model} /> : null}
					{item.type === "mcp" ? <McpAbilitySection item={item} model={model} /> : null}
					{item.type === "bundle" ? <BundleMembersSection item={item} model={model} /> : null}
				</div>
			</div>

			{item.type === "bundle" ? (
				<BundleUninstallDialog
					bundle={item}
					open={bundleDialogOpen}
					onOpenChange={setBundleDialogOpen}
					onConfirm={(members) => model.uninstallBundleMembers(members)}
				/>
			) : null}
			<AbilityMcpDialogs mcp={model.mcp} />
		</div>
	);
}
