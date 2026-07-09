import type { McpServerConfigData } from "@preload/api.js";
import { useTranslation } from "react-i18next";
import { isHttpMcpServerConfigData } from "./useMcpSettingsModel";

export function McpServerDetail({
	name,
	server,
}: {
	name: string;
	server: McpServerConfigData;
}): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="border-t border-border bg-secondary/30 px-5 py-3">
			{(server.displayName || server.description) && (
				<div className="mb-3 grid grid-cols-1 gap-y-2 text-[12px]">
					{server.displayName && <DetailItem label={t("displayName")} value={server.displayName} />}
					<DetailItem label={t("serverName")} value={name} />
					{server.description && <DetailItem label={t("description")} value={server.description} />}
				</div>
			)}
			<div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
				<DetailItem label={t("transportType")} value={isHttpMcpServerConfigData(server) ? "HTTP" : t("stdio")} />
				{isHttpMcpServerConfigData(server) ? (
					<DetailItem label={t("sseUrl")} value={server.url} />
				) : (
					<>
						<DetailItem label={t("command")} value={server.command} />
						<DetailItem label={t("arguments")} value={server.args?.join(", ") || "—"} />
						<DetailItem label={t("workDirectory")} value={server.cwd || "—"} />
					</>
				)}
				<DetailItem
					label={t("startupTimeout")}
					value={server.startupTimeout != null ? `${server.startupTimeout}ms` : t("default10s")}
				/>
				<DetailItem label={t("debugMode")} value={server.debug ? t("statusEnabled") : t("statusDisabled")} />
				<DetailItem label={t("autoApproveTools")} value={server.autoApprove?.join(", ") || "—"} />
			</div>
			{!isHttpMcpServerConfigData(server) && server.env && Object.keys(server.env).length > 0 && (
				<DetailMap title={t("envVariables")} entries={server.env} />
			)}
			{isHttpMcpServerConfigData(server) && server.headers && Object.keys(server.headers).length > 0 && (
				<DetailMap title={t("requestHeaders")} entries={server.headers} />
			)}
		</div>
	);
}

function DetailItem({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div>
			<span className="text-muted-foreground">{label}: </span>
			<span className="text-foreground">{value}</span>
		</div>
	);
}

function DetailMap({ title, entries }: { title: string; entries: Record<string, string> }): JSX.Element {
	return (
		<div className="mt-3">
			<div className="mb-1 text-[11px] text-muted-foreground">{title}</div>
			<div className="rounded-lg bg-muted px-3 py-2 font-mono text-[11px] text-foreground">
				{Object.entries(entries).map(([key, value]) => (
					<div key={key}>
						{key}={value}
					</div>
				))}
			</div>
		</div>
	);
}
