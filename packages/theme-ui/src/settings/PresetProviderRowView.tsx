import { useState, type JSX, type ReactNode } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Switch, cn } from "@vetta-org/ui";
import { InputField } from "./SettingsFormFields";

export interface PresetProviderRowModelView {
	readonly displayName: string;
	readonly icon?: string;
	readonly isExpanded: boolean;
	readonly isOpen: boolean;
	readonly adopted: boolean;
	readonly enabled: boolean;
	readonly autoKey: boolean;
	readonly baseUrl?: string;
	readonly offline: boolean;
	readonly models: readonly unknown[];
	readonly refreshing: boolean;
	readonly hasApiKey: boolean;
	readonly modelsError: string | null;
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
	readonly apiKeyPlaceholder: string;
	readonly encryptedApiKeyPlaceholder: string;
	readonly save: string;
	readonly refreshModels: string;
	readonly refreshingModels: string;
	readonly copyApiKey: string;
	readonly editBaseUrl: string;
	readonly baseUrlPlaceholder: string;
	readonly toggleProvider: (name: string) => string;
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
	/** 返回是否已保存;保存成功后关闭地址弹窗。 */
	readonly onChangeBaseUrl: (url: string) => Promise<boolean>;
	readonly onRemove: () => void;
	readonly onRefreshModels: () => void;
	readonly onCopyApiKey: () => void;
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
	onChangeBaseUrl,
	onRemove,
	onRefreshModels,
	onCopyApiKey,
	icon,
	modelsList,
}: PresetProviderRowViewProps): JSX.Element {
	// 已下线的旧条目不在内置目录里,给不了 key 也拉不到模型。
	const canEditKey = !row.offline && !row.autoKey;
	const keyDialogOpen = canEditKey && row.isOpen;
	// 内置密钥的服务（如 Magpie）不填 key，但地址（端口）要能改。
	const canEditUrl = row.autoKey && !row.offline;
	const [urlDraft, setUrlDraft] = useState<string | null>(null);
	const urlDialogOpen = canEditUrl && urlDraft !== null;

	const tryAdopt = (): void => {
		if (draftKey.trim() && !saving) onAdopt();
	};
	// 内置服务（Magpie）只开放端口：主机与路径固定，草稿里只放端口号。
	const portValid = urlDraft !== null && /^\d{1,5}$/.test(urlDraft) && Number(urlDraft) >= 1 && Number(urlDraft) <= 65535;
	const submitUrl = async (): Promise<void> => {
		if (urlDraft === null || !portValid || saving || !row.baseUrl) return;
		if (await onChangeBaseUrl(withPort(row.baseUrl, urlDraft))) setUrlDraft(null);
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
							{labels.modelsCount(row.models.length)}
							{canEditUrl && row.baseUrl ? ` · ${row.baseUrl}` : ""}
						</div>
					</div>
				</button>

				<div className="flex h-8 items-center justify-end gap-1.5">
					{row.adopted && !row.offline && (
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
					{canEditUrl && (
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => setUrlDraft(portOf(row.baseUrl))}
							title={labels.editBaseUrl}
							aria-label={labels.editBaseUrl}
							className="text-muted-foreground hover:text-foreground"
						>
							<span className="icon-[mdi--link-variant] h-3.5 w-3.5" />
						</Button>
					)}
					{row.adopted && !row.autoKey && (
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
					{!row.offline && (
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
								className="h-9 rounded-md px-2.5 text-[13px]"
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

			<Dialog open={urlDialogOpen} onOpenChange={(next) => !next && !saving && setUrlDraft(null)}>
				<DialogContent className="sm:max-w-[420px]">
					<DialogHeader>
						<DialogTitle>{row.displayName}</DialogTitle>
						<DialogDescription>{labels.editBaseUrl}</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-2">
						<span className="shrink-0 text-[13px] text-muted-foreground">{hostPrefix(row.baseUrl)}</span>
						<InputField
							value={urlDraft ?? ""}
							onChange={(value) => setUrlDraft(value.replace(/\D/g, "").slice(0, 5))}
							placeholder={labels.baseUrlPlaceholder}
							disabled={saving}
							autoFocus
							aria-label={labels.editBaseUrl}
							className="h-9 w-24 rounded-md px-2.5 text-[13px]"
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void submitUrl();
							}
						}}
						/>
					</div>
					<DialogFooter>
						<Button variant="ghost" size="sm" onClick={() => setUrlDraft(null)} disabled={saving}>
							{labels.cancel}
						</Button>
						<Button variant="primary" size="sm" onClick={() => void submitUrl()} disabled={!portValid || saving}>
							{labels.save}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function portOf(baseUrl: string | undefined): string {
	try {
		return baseUrl ? new URL(baseUrl).port : "";
	} catch {
		return "";
	}
}

/** 端口输入框左侧的固定前缀，如 `http://127.0.0.1:`。 */
function hostPrefix(baseUrl: string | undefined): string {
	try {
		return baseUrl ? `${new URL(baseUrl).protocol}//${new URL(baseUrl).hostname}:` : "";
	} catch {
		return "";
	}
}

function withPort(baseUrl: string, port: string): string {
	const url = new URL(baseUrl);
	url.port = port;
	return url.toString().replace(/\/$/, "");
}
