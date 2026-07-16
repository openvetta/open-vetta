import { SkillTypeIcon } from "@vetta/theme-ui/skills";
import {
	Button,
	cn,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@vetta/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	CapabilitiesModel,
	CapabilityItem,
	ConnectorCapability,
} from "../hooks/useCapabilitiesModel";

function CapabilityDefaultIcon(): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			className="h-5 w-5 text-[#1C274C] dark:text-white"
			aria-hidden
		>
			<path
				d="M17.5777 4.43152L15.5777 3.38197C13.8221 2.46066 12.9443 2 12 2C11.0557 2 10.1779 2.46066 8.42229 3.38197L8.10057 3.5508L17.0236 8.64967L21.0403 6.64132C20.3941 5.90949 19.3515 5.36234 17.5777 4.43152Z"
				fill="currentColor"
			/>
			<path
				d="M21.7484 7.96434L17.75 9.96353V13C17.75 13.4142 17.4142 13.75 17 13.75C16.5858 13.75 16.25 13.4142 16.25 13V10.7135L12.75 12.4635V21.904C13.4679 21.7252 14.2848 21.2965 15.5777 20.618L17.5777 19.5685C19.7294 18.4393 20.8052 17.8748 21.4026 16.8603C22 15.8458 22 14.5833 22 12.0585V11.9415C22 10.0489 22 8.86557 21.7484 7.96434Z"
				fill="currentColor"
			/>
			<path
				d="M11.25 21.904V12.4635L2.25164 7.96434C2 8.86557 2 10.0489 2 11.9415V12.0585C2 14.5833 2 15.8458 2.5974 16.8603C3.19479 17.8748 4.27062 18.4393 6.42228 19.5685L8.42229 20.618C9.71524 21.2965 10.5321 21.7252 11.25 21.904Z"
				fill="currentColor"
			/>
			<path
				d="M2.95969 6.64132L12 11.1615L15.4112 9.4559L6.52456 4.37785L6.42229 4.43152C4.64855 5.36234 3.6059 5.90949 2.95969 6.64132Z"
				fill="currentColor"
			/>
		</svg>
	);
}

function CapabilityIcon({ item }: { item: CapabilityItem }): JSX.Element {
	const [failedIcon, setFailedIcon] = useState<string | null>(null);

	// 技能：支持 solar / 上传图 / 默认 type 图标（与详情 dialog 一致）
	if (item.driver === "skill") {
		return (
			<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-accent/50 text-foreground">
				<SkillTypeIcon type={item.skill.type} icon={item.skill.icon} className="h-5 w-5" />
			</div>
		);
	}

	const showImage = Boolean(item.iconUrl) && failedIcon !== item.iconUrl;

	return (
		<div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/40 bg-accent/50">
			{showImage && item.iconUrl ? (
				<img
					src={item.iconUrl}
					alt=""
					className="h-full w-full object-contain"
					onError={() => setFailedIcon(item.iconUrl ?? null)}
				/>
			) : (
				<CapabilityDefaultIcon />
			)}
		</div>
	);
}

function CapabilityBadges({ item }: { item: CapabilityItem }): JSX.Element {
	const { t } = useTranslation("skills");
	return (
		<>
			{item.setupRequired && (
				<span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
					{t("capabilities.status.setupRequired")}
				</span>
			)}
			{item.needsUpdate && (
				<span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
					{t("capabilities.status.updateAvailable")}
				</span>
			)}
			{item.isCustom && (
				<span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
					{t("capabilities.status.custom")}
				</span>
			)}
			{item.readonly && (
				<span className="inline-flex shrink-0 items-center rounded-full bg-accent/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80">
					{t("capabilities.status.readonly")}
				</span>
			)}
		</>
	);
}

function ConnectorMenuItems({
	item,
	model,
}: {
	item: ConnectorCapability;
	model: CapabilitiesModel;
}): JSX.Element {
	const { t } = useTranslation("skills");
	return (
		<>
			{item.setupRequired && (
				<DropdownMenuItem onSelect={() => model.setup(item)}>
					<span className="icon-[solar--settings-linear] h-3.5 w-3.5" />
					{t("capabilities.actions.finishSetup")}
				</DropdownMenuItem>
			)}
			{item.usesOAuth && (
				<DropdownMenuItem
					onSelect={() => (item.authorized ? model.revokeAuthorization(item) : model.setup(item))}
				>
					<span
						className={cn(
							"h-3.5 w-3.5",
							item.authorized ? "icon-[solar--link-broken-linear]" : "icon-[solar--shield-keyhole-linear]",
						)}
					/>
					{item.authorized
						? t("capabilities.actions.disconnectAccount")
						: t("capabilities.actions.connectAccount")}
				</DropdownMenuItem>
			)}
			{item.canConfigure && (
				<DropdownMenuItem onSelect={() => model.configure(item)}>
					<span className="icon-[solar--key-minimalistic-square-linear] h-3.5 w-3.5" />
					{t("capabilities.actions.configure")}
				</DropdownMenuItem>
			)}
			{item.canEdit && (
				<DropdownMenuItem onSelect={() => model.edit(item)}>
					<span className="icon-[solar--pen-2-linear] h-3.5 w-3.5" />
					{t("capabilities.actions.edit")}
				</DropdownMenuItem>
			)}
		</>
	);
}

function InstalledMoreMenu({
	item,
	model,
}: {
	item: CapabilityItem;
	model: CapabilitiesModel;
}): JSX.Element {
	const { t } = useTranslation("skills");

	if (item.readonly) {
		return (
			<span className="flex h-8 w-8 items-center justify-center text-muted-foreground/60" title={t("capabilities.status.readonly")}>
				<span className="icon-[solar--lock-keyhole-minimalistic-linear] h-3.5 w-3.5" />
			</span>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					disabled={item.busy}
					aria-label={t("capabilities.actions.more")}
				>
					{item.busy ? (
						<span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />
					) : (
						<span className="icon-[solar--menu-dots-bold] h-3.5 w-3.5" />
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-44">
				{item.driver === "skill" ? (
					<>
						<DropdownMenuItem onSelect={() => model.preview(item)}>
							<span className="icon-[solar--eye-linear] h-3.5 w-3.5" />
							{t("capabilities.actions.viewDetails")}
						</DropdownMenuItem>
						{item.needsUpdate && (
							<DropdownMenuItem onSelect={() => model.add(item)}>
								<span className="icon-[solar--refresh-linear] h-3.5 w-3.5" />
								{t("capabilities.actions.update")}
							</DropdownMenuItem>
						)}
					</>
				) : (
					<ConnectorMenuItems item={item} model={model} />
				)}
				<DropdownMenuItem onSelect={() => model.toggle(item)}>
					<span
						className={cn(
							"h-3.5 w-3.5",
							item.enabled
								? "icon-[solar--pause-circle-linear]"
								: "icon-[solar--play-circle-linear]",
						)}
					/>
					{item.enabled ? t("capabilities.actions.disable") : t("capabilities.actions.enable")}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem className="text-destructive" onSelect={() => model.remove(item)}>
					<span className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
					{t("capabilities.actions.remove")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function CapabilityActions({
	item,
	model,
}: {
	item: CapabilityItem;
	model: CapabilitiesModel;
}): JSX.Element {
	const { t } = useTranslation("skills");

	if (!item.installed) {
		return (
			<Button
				variant="secondary"
				size="sm"
				disabled={item.busy}
				className="border border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
				onClick={() => model.add(item)}
			>
				{item.busy ? (
					<span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />
				) : null}
				{t("capabilities.actions.add")}
			</Button>
		);
	}

	return <InstalledMoreMenu item={item} model={model} />;
}

export function CapabilityCard({
	item,
	model,
}: {
	item: CapabilityItem;
	model: CapabilitiesModel;
}): JSX.Element {
	const { t } = useTranslation("skills");
	const previewable = item.driver === "skill";

	return (
		<div
			onClick={previewable ? () => model.preview(item) : undefined}
			className={cn(
				"group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-accent/60",
				previewable && "cursor-pointer",
				!item.enabled && item.installed && "opacity-75",
			)}
		>
			<CapabilityIcon item={item} />
			<div className="min-w-0 flex-1">
				<div className="flex min-w-0 flex-wrap items-center gap-1.5">
					<h3 className="truncate text-[13px] font-semibold text-foreground">{item.title}</h3>
					<CapabilityBadges item={item} />
				</div>
				<p className="mt-0.5 truncate text-[11px] leading-relaxed text-muted-foreground/70">
					{item.description || t("capabilities.card.noDescription")}
				</p>
			</div>
			<div className="shrink-0" onClick={(event) => event.stopPropagation()}>
				<CapabilityActions item={item} model={model} />
			</div>
		</div>
	);
}
