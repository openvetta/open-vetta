import type { JSX, ReactNode } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Switch, cn } from "@vetta-org/ui";
import { InputField } from "./SettingsFormFields";

export interface PresetProviderRowModelView {
	readonly displayName: string;
	readonly icon?: string;
	readonly isExpanded: boolean;
	readonly isOpen: boolean;
	readonly adopted: boolean;
	readonly enabled: boolean;
	readonly baseUrl?: string;
	readonly offline: boolean;
	readonly models: readonly unknown[];
	readonly refreshing: boolean;
	readonly hasApiKey: boolean;
	readonly modelsError: string | null;
	/** 由外部程序接入并管理(如 Magpie):只展示是否已接入,没有任何操作按钮。 */
	readonly managedBy?: string;
}

export interface PresetProviderRowViewLabels {
	readonly collapseModels: string;
	readonly viewModels: string;
	readonly enabled: string;
	readonly deprecated: string;
	readonly modelsCount: (count: number) => string;
	readonly collapse: string;
	readonly cancel: string;
	readonly changeKey: string;
	readonly remove: string;
	readonly enable: string;
	readonly apiKeyDirect: (name: string) => string;
	/** 输入框上方的字段名。 */
	readonly apiKeyLabel: string;
	readonly apiKeyPlaceholder: string;
	readonly encryptedApiKeyPlaceholder: string;
	readonly save: string;
	readonly refreshModels: string;
	readonly refreshingModels: string;
	readonly copyApiKey: string;
	readonly toggleProvider: (name: string) => string;
	/** 外部管理且已接入时,副标题里模型数后面的说明,如「由 Magpie 管理」。 */
	readonly managedConnected: string;
	/** 外部管理但还没接入时的副标题,告诉用户去哪里接入。 */
	readonly managedNotConnected: string;
	/** 外部管理的行右侧按钮,打开接入说明。 */
	readonly managedGuide: string;
}

export interface PresetProviderRowViewProps {
	readonly row: PresetProviderRowModelView;
	readonly draftKey: string;
	readonly saving: boolean;
	readonly labels: PresetProviderRowViewLabels;
	readonly onToggleExpanded: () => void;
	readonly onToggleEditor: () => void;
	readonly onDraftKeyChange: (key: string) => void;
	readonly onAdopt: () => void;
	readonly onToggleEnabled: (next: boolean) => void;
	readonly onRemove: () => void;
	readonly onRefreshModels: () => void;
	readonly onCopyApiKey: () => void;
	/** 外部管理的行(如 Magpie)打开接入说明;不传则不显示按钮。 */
	readonly onOpenManagedGuide?: () => void;
	readonly icon: ReactNode;
	readonly modelsList?: ReactNode;
}

export function PresetProviderRowView({
	row,
	draftKey,
	saving,
	labels,
	onToggleExpanded,
	onToggleEditor,
	onDraftKeyChange,
	onAdopt,
	onToggleEnabled,
	onRemove,
	onRefreshModels,
	onCopyApiKey,
	onOpenManagedGuide,
	icon,
	modelsList,
}: PresetProviderRowViewProps): JSX.Element {
	// 外部管理的(如 Magpie)只在对方那边开关,这里不给任何操作。
	const managed = Boolean(row.managedBy);
	// 已下线的旧条目不在内置目录里,给不了 key 也拉不到模型。
	const canEditKey = !managed && !row.offline;
	const keyDialogOpen = canEditKey && row.isOpen;

	const tryAdopt = (): void => {
		if (draftKey.trim() && !saving) onAdopt();
	};

	return (
		<div className="border-b border-border last:border-b-0">
			{/* 编辑一律走弹窗：窄屏下行内输入框会把左侧名称挤没。 */}
			<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
				<button
					type="button"
					onClick={onToggleExpanded}
					className="flex min-w-0 items-center gap-3 text-left"
					title={row.isExpanded ? labels.collapseModels : labels.viewModels}
				>
					<span
						className={cn(
							"icon-[mdi--chevron-right] h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150",
							row.isExpanded && "rotate-90",
						)}
					/>
					{icon}
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
							<span className="truncate">{row.displayName}</span>
							{row.enabled && (
								<span className="shrink-0 whitespace-nowrap rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium text-primary">
									{labels.enabled}
								</span>
							)}
							{row.offline && (
								<span className="shrink-0 whitespace-nowrap rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
									{labels.deprecated}
								</span>
							)}
						</div>
						<div className="mt-0.5 truncate text-[11px] text-muted-foreground">
							{managed && !row.adopted ? (
								labels.managedNotConnected
							) : (
								<>
									{labels.modelsCount(row.models.length)}
									{managed ? ` · ${labels.managedConnected}` : ""}
								</>
							)}
						</div>
					</div>
				</button>

				<div className="flex h-8 items-center justify-end gap-1.5">
					{managed && onOpenManagedGuide && (
						<Button
							variant="ghost"
							size="sm"
							onClick={onOpenManagedGuide}
							className="h-7 gap-1 rounded-full px-2.5 text-[12px] text-muted-foreground hover:text-foreground"
						>
							<span className="icon-[mdi--help-circle-outline] h-3.5 w-3.5" />
							{labels.managedGuide}
						</Button>
					)}
					{row.adopted && !row.offline && !managed && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onRefreshModels}
							disabled={row.refreshing}
							title={row.refreshing ? labels.refreshingModels : labels.refreshModels}
							className="text-muted-foreground hover:text-foreground"
						>
							<span className={cn("icon-[mdi--refresh] h-3.5 w-3.5", row.refreshing && "animate-spin")} />
						</Button>
					)}
					{canEditKey && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onToggleEditor}
							title={row.adopted ? labels.changeKey : labels.enable}
							aria-label={row.adopted ? labels.changeKey : labels.enable}
							className={cn("text-muted-foreground hover:text-foreground", !row.adopted && "hover:text-primary")}
						>
							<span className={cn("h-3.5 w-3.5", row.adopted ? "icon-[mdi--key-outline]" : "icon-[mdi--key-plus]")} />
						</Button>
					)}
					{row.adopted && !managed && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={onRemove}
							title={labels.remove}
							aria-label={labels.remove}
							className="text-muted-foreground hover:text-destructive"
						>
							<span className="icon-[mdi--delete-outline] h-3.5 w-3.5" />
						</Button>
					)}
					{!row.offline && !managed && (
						<Switch
							size="sm"
							checked={row.enabled}
							disabled={saving}
							onCheckedChange={onToggleEnabled}
							aria-label={labels.toggleProvider(row.displayName)}
						/>
					)}
					{row.offline && !row.adopted && (
						<span className="text-[11px] text-muted-foreground">{labels.deprecated}</span>
					)}
				</div>
			</div>

			{/* 错误行独立展示,弹窗关着时也能看到校验失败原因。 */}
			{row.modelsError && <div className="truncate px-5 pb-2.5 text-[11px] text-amber-400">{row.modelsError}</div>}

			{row.isExpanded && modelsList}

			<Dialog open={keyDialogOpen} onOpenChange={(next) => !next && !saving && onToggleEditor()}>
				<DialogContent className="sm:max-w-[420px]">
					<DialogHeader>
						<DialogTitle>{row.displayName}</DialogTitle>
						<DialogDescription>{labels.apiKeyDirect(row.displayName)}</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-2">
						<span className="text-[14px] font-medium text-foreground">
							{labels.apiKeyLabel}
						</span>
						<div className="flex items-center gap-1.5">
							<div className="min-w-0 flex-1">
								<InputField
									value={draftKey}
									onChange={onDraftKeyChange}
									placeholder={row.hasApiKey ? labels.encryptedApiKeyPlaceholder : labels.apiKeyPlaceholder}
									type="password"
									disabled={saving}
									autoFocus
									aria-label={labels.apiKeyDirect(row.displayName)}
									className="h-10 rounded-xl px-3.5 text-[15px] md:text-[15px]"
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											tryAdopt();
										}
									}}
								/>
							</div>
							{row.hasApiKey && (
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={onCopyApiKey}
									title={labels.copyApiKey}
									aria-label={labels.copyApiKey}
									className="shrink-0 text-muted-foreground hover:text-foreground"
								>
									<span className="icon-[mdi--content-copy] h-3.5 w-3.5" />
								</Button>
							)}
						</div>
					</div>
					<DialogFooter>
						<Button variant="ghost" size="sm" onClick={onToggleEditor} disabled={saving}>
							{labels.cancel}
						</Button>
						<Button variant="primary" size="sm" onClick={tryAdopt} disabled={!draftKey.trim() || saving}>
							{row.adopted ? labels.save : labels.enable}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
