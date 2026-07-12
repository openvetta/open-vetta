import type { MarketMcpServer } from "@shared/lib/api";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { useTranslation } from "react-i18next";
import { RemoteMcpSectionView } from "./RemoteMcpSectionView";
import {
	type RemoteMcpSectionModel,
	useRemoteMcpSectionModel,
} from "./useRemoteMcpSectionModel";

export type { RemoteMcpSectionModel };
export { useRemoteMcpSectionModel };

function useRemoteMcpLabels() {
	const { t } = useTranslation("settings");
	return {
		add: t("add"),
		added: t("added"),
		loading: t("loading"),
		noRemoteMcp: t("noRemoteMcp"),
		processing: t("processing"),
		refresh: t("refresh"),
		remoteAllAdded: t("mcpStore.remoteAllAdded"),
		remoteListTitle: t("section_mcp-remote-list"),
		remoteSupport: t("remoteMcpSupport"),
		remove: t("remove"),
	};
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
	const model = useRemoteMcpSectionModel({ onAdd, onRemove });
	return (
		<RemoteMcpSectionView
			addedNames={addedNames}
			labels={useRemoteMcpLabels()}
			model={model}
			showHeader
		/>
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
	return (
		<RemoteMcpSectionView
			addedNames={addedNames}
			discover
			labels={useRemoteMcpLabels()}
			model={model}
			showHeader={false}
		/>
	);
}

export function RemoteMcpRefreshButton({
	model,
}: {
	model: Pick<RemoteMcpSectionModel, "load" | "loading">;
}): JSX.Element {
	const labels = useRemoteMcpLabels();
	return (
		<Button variant="ghost" size="sm" onClick={model.load} disabled={model.loading} className="shrink-0">
			<span className={cn("icon-[mdi--refresh] mr-1 h-3.5 w-3.5", model.loading && "animate-spin")} />
			{labels.refresh}
		</Button>
	);
}
