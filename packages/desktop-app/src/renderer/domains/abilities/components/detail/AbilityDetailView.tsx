import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveAbilityDetailContent } from "../../lib/ability-presentation";
import type { AbilitiesModel, AbilityItem } from "../../types";
import { AbilityMcpDialogs } from "../AbilityMcpDialogs";
import { AbilityDetailEnter } from "./AbilityDetailEnter";
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
			<div className="flex-1 overflow-y-auto px-8 pb-10 [scrollbar-gutter:stable]">
				<div className="mx-auto flex w-full max-w-3xl flex-col gap-7">
					<AbilityDetailEnter index={0}>
						<AbilityDetailHeader
							item={item}
							onBack={onBack}
							onPrimary={handlePrimary}
							onSecondary={handleSecondary}
						/>
					</AbilityDetailEnter>

					{model.errors.length > 0 ? (
						<div className="rounded-lg bg-muted/60 px-3 py-2 text-[12px] text-muted-foreground/70">
							{t("error.partial", { error: model.errors.join(" / ") })}
						</div>
					) : null}

					{detail.showcases.length > 0 ? (
						<AbilityDetailEnter index={1}>
							<AbilityShowcaseList
								showcases={detail.showcases}
								fallbackBrandIconUrl={item.icon}
								fallbackBrandName={item.title}
							/>
						</AbilityDetailEnter>
					) : null}

					<AbilityDetailEnter index={2}>
						{detail.content ? (
							<AbilityMarkdownBody content={detail.content} />
						) : (
							<p className="text-[13px] leading-relaxed text-muted-foreground">{t("detail.noContent")}</p>
						)}
					</AbilityDetailEnter>

					<AbilityDetailEnter index={3}>
						{item.type === "plugin" ? <PluginAbilitySection item={item} model={model} /> : null}
						{item.type === "mcp" ? <McpAbilitySection item={item} model={model} /> : null}
						{item.type === "bundle" ? <BundleMembersSection item={item} model={model} /> : null}
					</AbilityDetailEnter>

					{/* 元信息表固定在页尾 */}
					<AbilityDetailEnter index={4}>
						<AbilityMetaList meta={detail.meta} />
					</AbilityDetailEnter>
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
