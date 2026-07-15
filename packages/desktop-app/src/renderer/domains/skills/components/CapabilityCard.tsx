import {
	Button,
	cn,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	Switch,
} from "@vetta/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	CapabilitiesModel,
	CapabilityItem,
	CapabilityScope,
	ConnectorCapability,
} from "../hooks/useCapabilitiesModel";

function CapabilityIcon({ item }: { item: CapabilityItem }): JSX.Element {
	const [failedIcon, setFailedIcon] = useState<string | null>(null);
	const showImage = Boolean(item.iconUrl) && failedIcon !== item.iconUrl;

	return showImage && item.iconUrl ? (
		<img
			src={item.iconUrl}
			alt=""
			className="h-10 w-10 shrink-0 rounded-lg object-contain"
			onError={() => setFailedIcon(item.iconUrl ?? null)}
		/>
	) : (
		<div
			className={cn(
				"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
				item.installed ? "bg-primary/10 text-primary" : "bg-accent/50 text-muted-foreground/70",
			)}
		>
			<span className="icon-[solar--magic-stick-3-linear] h-4 w-4" />
		</div>
	);
}

function CapabilityBadges({ item, scope }: { item: CapabilityItem; scope: CapabilityScope }): JSX.Element {
	const { t } = useTranslation("skills");
	return (
		<>
			{scope === "discover" && item.installed && (
				<span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
					{t("capabilities.status.added")}
				</span>
			)}
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

function CapabilityActions({
	item,
	scope,
	model,
}: {
	item: CapabilityItem;
	scope: CapabilityScope;
	model: CapabilitiesModel;
}): JSX.Element {
	const { t } = useTranslation("skills");

	if (scope === "discover") {
		if (item.installed && item.needsUpdate) {
			return (
				<Button variant="primary" size="sm" disabled={item.busy} onClick={() => model.add(item)}>
					{item.busy && <span className="icon-[solar--refresh-linear] h-3.5 w-3.5 animate-spin" />}
					{t("capabilities.actions.update")}
				</Button>
			);
		}
		if (item.installed) {
			return (
				<Button variant="outline" size="sm" disabled>
					<span className="icon-[solar--check-circle-linear] h-3.5 w-3.5 text-emerald-400" />
					{t("capabilities.status.added")}
				</Button>
			);
		}
		return (
			<Button variant="primary" size="sm" disabled={item.busy} onClick={() => model.add(item)}>
				<span
					className={cn(
						"h-3.5 w-3.5",
						item.busy ? "icon-[solar--refresh-linear] animate-spin" : "icon-[solar--add-circle-linear]",
					)}
				/>
				{t("capabilities.actions.add")}
			</Button>
		);
	}

	if (item.readonly) {
		return (
			<span className="flex h-7 items-center gap-1 px-1.5 text-[11px] text-muted-foreground/60">
				<span className="icon-[solar--lock-keyhole-minimalistic-linear] h-3.5 w-3.5" />
				{t("capabilities.status.readonly")}
			</span>
		);
	}

	return (
		<div className="flex items-center gap-1.5">
			{item.driver === "connector" && item.setupRequired && (
				<Button variant="primary" size="sm" disabled={item.busy} onClick={() => model.setup(item)}>
					{t("capabilities.actions.finishSetup")}
				</Button>
			)}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						disabled={item.busy}
						aria-label={t("capabilities.actions.more")}
					>
						<span className="icon-[solar--menu-dots-linear] h-3.5 w-3.5" />
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
					<DropdownMenuSeparator />
					<DropdownMenuItem className="text-destructive" onSelect={() => model.remove(item)}>
						<span className="icon-[solar--trash-bin-trash-linear] h-3.5 w-3.5" />
						{t("capabilities.actions.remove")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<div onClick={(event) => event.stopPropagation()}>
				<Switch
					size="sm"
					checked={item.enabled}
					disabled={item.busy}
					onCheckedChange={() => model.toggle(item)}
					aria-label={item.enabled ? t("capabilities.actions.disable") : t("capabilities.actions.enable")}
				/>
			</div>
		</div>
	);
}

export function CapabilityCard({
	item,
	scope,
	model,
}: {
	item: CapabilityItem;
	scope: CapabilityScope;
	model: CapabilitiesModel;
}): JSX.Element {
	const { t } = useTranslation("skills");
	const previewable = item.driver === "skill";

	return (
		<div
			onClick={previewable ? () => model.preview(item) : undefined}
			className={cn(
				"group flex min-h-28 flex-col rounded-xl border border-border/50 bg-card/40 px-3.5 pt-3 pb-3 backdrop-blur-sm transition-colors duration-200 hover:border-primary/40 hover:bg-card/60",
				previewable && "cursor-pointer",
				!item.enabled && item.installed && "opacity-75",
			)}
		>
			<div className="flex items-start gap-2.5">
				<CapabilityIcon item={item} />
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-wrap items-center gap-1.5">
						<h3 className="truncate text-[13px] font-semibold text-foreground">{item.title}</h3>
						<CapabilityBadges item={item} scope={scope} />
					</div>
					<p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground/70">
						{item.description || t("capabilities.card.noDescription")}
					</p>
				</div>
			</div>

			<div className="mt-auto flex items-end justify-between gap-2 pt-3">
				<div className="min-w-0 text-[10px] text-muted-foreground/60">
					{item.downloadCount > 0 && (
						<span className="inline-flex items-center gap-1">
							<span className="icon-[solar--download-minimalistic-linear] h-3 w-3" />
							{t("capabilities.card.usageCount", { count: item.downloadCount })}
						</span>
					)}
				</div>
				<div onClick={(event) => event.stopPropagation()}>
					<CapabilityActions item={item} scope={scope} model={model} />
				</div>
			</div>
		</div>
	);
}
