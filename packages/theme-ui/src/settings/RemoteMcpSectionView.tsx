import { useMemo, type JSX } from "react";
import { Button, cn } from "@vetta/ui";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface RemoteMcpServerRowView {
	readonly id: string | number;
	readonly name: string;
	readonly display_name?: string;
	readonly description?: string;
}

export interface RemoteMcpSectionViewLabels {
	readonly add: string;
	readonly added: string;
	readonly loading: string;
	readonly noRemoteMcp: string;
	readonly processing: string;
	readonly refresh: string;
	readonly remoteAllAdded: string;
	readonly remoteListTitle: string;
	readonly remoteSupport: string;
	readonly remove: string;
}

export interface RemoteMcpSectionViewModel {
	readonly items: readonly RemoteMcpServerRowView[] | null;
	readonly loading: boolean;
	readonly error: string | null;
	readonly busy: string | null;
	readonly load: () => void;
	readonly handleAction: (server: RemoteMcpServerRowView, action: "add" | "remove") => Promise<void>;
}

export interface RemoteMcpSectionViewProps {
	readonly addedNames: Set<string>;
	readonly discover?: boolean;
	readonly labels: RemoteMcpSectionViewLabels;
	readonly model: RemoteMcpSectionViewModel;
	readonly showHeader?: boolean;
	readonly remoteSection: SettingSectionMeta;
}

export function RemoteMcpSectionView({
	addedNames,
	discover = false,
	labels,
	model,
	showHeader = true,
	remoteSection,
}: RemoteMcpSectionViewProps): JSX.Element {
	const visibleItems = useMemo(() => {
		const list = model.items ?? [];
		if (!discover) return list;
		return list.filter((server) => !addedNames.has(server.name));
	}, [addedNames, discover, model.items]);

	return (
		<div>
			{showHeader && (
				<div className="mb-3 flex items-center justify-between gap-3">
					<div className="min-w-0">
						<div className="text-[12px] font-medium text-foreground">{labels.remoteListTitle}</div>
						<p className="mt-0.5 text-[11px] text-muted-foreground">{labels.remoteSupport}</p>
					</div>
					<Button variant="ghost" size="sm" onClick={model.load} disabled={model.loading} className="shrink-0">
						<span className={cn("icon-[mdi--refresh] mr-1 h-3.5 w-3.5", model.loading && "animate-spin")} />
						{labels.refresh}
					</Button>
				</div>
			)}
			<SettingSection section={remoteSection} title="">
				{model.loading && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">{labels.loading}</div>
				)}
				{!model.loading && model.error && (
					<div className="px-5 py-4 text-center text-[12px] text-destructive">{model.error}</div>
				)}
				{!model.loading && !model.error && visibleItems.length === 0 && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
						{discover && (model.items?.length ?? 0) > 0 ? labels.remoteAllAdded : labels.noRemoteMcp}
					</div>
				)}
				{!model.loading &&
					!model.error &&
					visibleItems.map((server) => (
						<RemoteMcpRowView
							key={server.id}
							server={server}
							added={addedNames.has(server.name)}
							busy={model.busy === server.name}
							discover={discover}
							labels={labels}
							onAction={model.handleAction}
						/>
					))}
			</SettingSection>
		</div>
	);
}

function RemoteMcpRowView({
	server,
	added,
	busy,
	discover,
	labels,
	onAction,
}: {
	server: RemoteMcpServerRowView;
	added: boolean;
	busy: boolean;
	discover: boolean;
	labels: RemoteMcpSectionViewLabels;
	onAction: (server: RemoteMcpServerRowView, action: "add" | "remove") => Promise<void>;
}): JSX.Element {
	return (
		<div className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-[13px] font-medium text-foreground">
						{server.display_name || server.name}
					</span>
					{!discover && added && (
						<span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
							{labels.added}
						</span>
					)}
				</div>
				{server.description ? (
					<p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{server.description}</p>
				) : null}
			</div>
			{discover || !added ? (
				<Button variant="primary" size="sm" disabled={busy} onClick={() => void onAction(server, "add")}>
					{busy ? labels.processing : labels.add}
				</Button>
			) : (
				<Button variant="ghost" size="sm" disabled={busy} onClick={() => void onAction(server, "remove")}>
					{busy ? labels.processing : labels.remove}
				</Button>
			)}
		</div>
	);
}
