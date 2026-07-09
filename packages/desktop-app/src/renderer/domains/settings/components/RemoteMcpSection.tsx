import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { fetchMarketMcpServers, type MarketMcpServer } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/auth-atoms";
import { cn } from "@shared/lib/utils";
import { SettingHeading, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

export function RemoteMcpSection({
	addedNames,
	onAdd,
	onRemove,
}: {
	addedNames: Set<string>;
	onAdd: (server: MarketMcpServer) => Promise<void> | void;
	onRemove: (name: string) => Promise<void> | void;
}): JSX.Element {
	const model = useRemoteMcpSectionModel({ onAdd, onRemove });
	return <RemoteMcpSectionView model={model} addedNames={addedNames} />;
}

function useRemoteMcpSectionModel({
	onAdd,
	onRemove,
}: {
	onAdd: (server: MarketMcpServer) => Promise<void> | void;
	onRemove: (name: string) => Promise<void> | void;
}) {
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

function RemoteMcpSectionView({
	model,
	addedNames,
}: {
	model: ReturnType<typeof useRemoteMcpSectionModel>;
	addedNames: Set<string>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="mt-8">
			<div className="mb-3 flex items-center justify-between">
				<div>
					<SettingHeading section={SETTINGS_SECTION["mcp-remote-list"]} />
					<p className="mt-0.5 text-[11px] text-muted-foreground">{t("remoteMcpSupport")}</p>
				</div>
				<Button variant="ghost" size="sm" onClick={model.load} disabled={model.loading}>
					<span className={cn("icon-[mdi--refresh] mr-1 h-3.5 w-3.5", model.loading && "animate-spin")} />
					{t("refresh")}
				</Button>
			</div>

			<SettingSection section={SETTINGS_SECTION["mcp-remote-available"]}>
				{model.loading && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">{t("loading")}</div>
				)}

				{!model.loading && model.error && (
					<div className="px-5 py-4 text-center text-[12px] text-destructive">{model.error}</div>
				)}

				{!model.loading && !model.error && model.items && model.items.length === 0 && (
					<div className="px-5 py-6 text-center text-[12px] text-muted-foreground">{t("noRemoteMcp")}</div>
				)}

				{!model.loading &&
					!model.error &&
					model.items?.map((server) => (
						<RemoteMcpRow
							key={server.id}
							server={server}
							added={addedNames.has(server.name)}
							busy={model.busy === server.name}
							onAction={model.handleAction}
						/>
					))}
			</SettingSection>
		</div>
	);
}

function RemoteMcpRow({
	server,
	added,
	busy,
	onAction,
}: {
	server: MarketMcpServer;
	added: boolean;
	busy: boolean;
	onAction: (server: MarketMcpServer, action: "add" | "remove") => Promise<void>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-[13px] font-medium text-foreground">{server.display_name || server.name}</span>
					<span className="rounded-full bg-accent px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
						{configTransportLabel(server.config)}
					</span>
					{added && (
						<span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
							{t("added")}
						</span>
					)}
				</div>
				<div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
					{summarizeRemoteConfig(server.config)}
				</div>
				{server.description && (
					<div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{server.description}</div>
				)}
			</div>
			{added ? (
				<Button variant="ghost" size="sm" disabled={busy} onClick={() => void onAction(server, "remove")}>
					{busy ? t("processing") : t("remove")}
				</Button>
			) : (
				<Button variant="primary" size="sm" disabled={busy} onClick={() => void onAction(server, "add")}>
					{busy ? t("processing") : t("add")}
				</Button>
			)}
		</div>
	);
}

function summarizeRemoteConfig(config: Record<string, unknown>): string {
	const type = typeof config.type === "string" ? config.type : config.command ? "stdio" : config.url ? "http" : "";
	if (type === "http" && typeof config.url === "string") return config.url;
	if (typeof config.command === "string") {
		const args = Array.isArray(config.args) ? config.args.filter((item) => typeof item === "string").join(" ") : "";
		return `${config.command}${args ? " " + args : ""}`;
	}
	return "";
}

function configTransportLabel(config: Record<string, unknown>): string {
	if (typeof config.type === "string") return config.type;
	if (typeof config.url === "string") return "http";
	if (typeof config.command === "string") return "stdio";
	return "—";
}
