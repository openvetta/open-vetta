import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { fetchMarketMcpServers, type MarketMcpServer } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/auth-atoms";
import { cn } from "@shared/lib/utils";
import { SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

export type RemoteMcpSectionModel = {
	items: MarketMcpServer[] | null;
	loading: boolean;
	error: string | null;
	busy: string | null;
	load: () => void;
	handleAction: (server: MarketMcpServer, action: "add" | "remove") => Promise<void>;
};

export function useRemoteMcpSectionModel({
	onAdd,
	onRemove,
}: {
	onAdd: (server: MarketMcpServer) => Promise<void> | void;
	onRemove: (name: string) => Promise<void> | void;
}): RemoteMcpSectionModel {
	const { t } = useTranslation("settings");
	const token = useAtomValue(authTokenAtom);
	const [items, setItems] = useState<MarketMcpServer[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);

	const load = useCallback(() => {
		if (!token) {
			setError(t("loginRequired"));
			setItems([]);
			return;
		}
		setLoading(true);
		setError(null);
		void fetchMarketMcpServers(token)
			.then((list) => {
				setItems(list);
				setError(null);
			})
			.catch((err: Error) => {
				setError(err.message || t("loadFailed"));
				setItems([]);
			})
			.finally(() => setLoading(false));
	}, [token, t]);

	useEffect(() => {
		load();
	}, [load]);

	const handleAction = useCallback(
		async (server: MarketMcpServer, action: "add" | "remove") => {
			setBusy(server.name);
			try {
				if (action === "add") {
					await onAdd(server);
				} else {
					await onRemove(server.name);
				}
			} finally {
				setBusy(null);
			}
		},
		[onAdd, onRemove],
	);

	return { items, loading, error, busy, load, handleAction };
}

export function RemoteMcpRefreshButton({
	model,
}: {
	model: Pick<RemoteMcpSectionModel, "load" | "loading">;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<Button variant="ghost" size="sm" onClick={model.load} disabled={model.loading} className="shrink-0">
			<span className={cn("icon-[mdi--refresh] mr-1 h-3.5 w-3.5", model.loading && "animate-spin")} />
			{t("refresh")}
		</Button>
	);
}

/** 完整区块：自持数据 + 标题行刷新 */
export function RemoteMcpSection({
	addedNames,
	onAdd,
	onRemove,
}: {
	addedNames: Set<string>;
	onAdd: (server: MarketMcpServer) => Promise<void> | void;
	onRemove: (name: string) => Promise<void> | void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const model = useRemoteMcpSectionModel({ onAdd, onRemove });
	return (
		<div>
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-[12px] font-medium text-foreground">{t("section_mcp-remote-list")}</div>
					<p className="mt-0.5 text-[11px] text-muted-foreground">{t("remoteMcpSupport")}</p>
				</div>
				<RemoteMcpRefreshButton model={model} />
			</div>
			<RemoteMcpList model={model} addedNames={addedNames} discover={false} />
		</div>
	);
}

/** 发现 Tab：外层持有 model，刷新放在「发现」标题行 */
export function RemoteMcpDiscoverList({
	model,
	addedNames,
}: {
	model: RemoteMcpSectionModel;
	addedNames: Set<string>;
}): JSX.Element {
	return <RemoteMcpList model={model} addedNames={addedNames} discover />;
}

function RemoteMcpList({
	model,
	addedNames,
	discover,
}: {
	model: RemoteMcpSectionModel;
	addedNames: Set<string>;
	discover: boolean;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const visibleItems = useMemo(() => {
		const list = model.items ?? [];
		if (!discover) return list;
		return list.filter((server) => !addedNames.has(server.name));
	}, [addedNames, discover, model.items]);

	return (
		<SettingSection section={SETTINGS_SECTION["mcp-remote-available"]} title="">
			{model.loading && (
				<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">{t("loading")}</div>
			)}

			{!model.loading && model.error && (
				<div className="px-5 py-4 text-center text-[12px] text-destructive">{model.error}</div>
			)}

			{!model.loading && !model.error && visibleItems.length === 0 && (
				<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">
					{discover && (model.items?.length ?? 0) > 0 ? t("mcpStore.remoteAllAdded") : t("noRemoteMcp")}
				</div>
			)}

			{!model.loading &&
				!model.error &&
				visibleItems.map((server) => (
					<RemoteMcpRow
						key={server.id}
						server={server}
						added={addedNames.has(server.name)}
						busy={model.busy === server.name}
						discover={discover}
						onAction={model.handleAction}
					/>
				))}
		</SettingSection>
	);
}

function RemoteMcpRow({
	server,
	added,
	busy,
	discover,
	onAction,
}: {
	server: MarketMcpServer;
	added: boolean;
	busy: boolean;
	discover: boolean;
	onAction: (server: MarketMcpServer, action: "add" | "remove") => Promise<void>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-[13px] font-medium text-foreground">{server.display_name || server.name}</span>
					{!discover && added && (
						<span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
							{t("added")}
						</span>
					)}
				</div>
				{server.description ? (
					<p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{server.description}</p>
				) : null}
			</div>
			{discover || !added ? (
				<Button variant="primary" size="sm" disabled={busy} onClick={() => void onAction(server, "add")}>
					{busy ? t("processing") : t("add")}
				</Button>
			) : (
				<Button variant="ghost" size="sm" disabled={busy} onClick={() => void onAction(server, "remove")}>
					{busy ? t("processing") : t("remove")}
				</Button>
			)}
		</div>
	);
}
