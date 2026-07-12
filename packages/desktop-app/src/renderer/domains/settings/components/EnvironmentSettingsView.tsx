import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import { SettingRow, SettingSection } from "./shared";
import type { EnvironmentRuntimeKind, EnvironmentRuntimeStatus, EnvironmentSettingsModel } from "./useEnvironmentSettingsModel";

const RUNTIME_META: Record<EnvironmentRuntimeKind, { icon: string; name: string }> = {
	node: {
		icon: "icon-[mdi--nodejs]",
		name: "Node.js",
	},
	python: {
		icon: "icon-[mdi--language-python]",
		name: "Python",
	},
};

export interface EnvironmentSettingsViewProps {
	model: EnvironmentSettingsModel;
}

function RuntimeCard({
	busy,
	kind,
	labels,
	onReinstall,
	status,
}: {
	busy: boolean;
	kind: EnvironmentRuntimeKind;
	labels: EnvironmentSettingsModel["labels"];
	onReinstall: () => void;
	status: EnvironmentRuntimeStatus;
}): JSX.Element {
	const meta = RUNTIME_META[kind];
	const stateText = !status.supported
		? labels.platformNotSupported
		: status.ready
			? `${labels.ready} · ${status.managedVersion}`
			: busy
				? labels.fetching
				: labels.notReady;
	const stateClass = status.ready ? "text-emerald-500" : status.supported ? "text-amber-500" : "text-muted-foreground";

	return (
		<SettingRow title={meta.name} description={labels.runtimeDescriptions[kind]} border={kind === "node"}>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1.5">
					<span
						className={
							status.ready
								? "icon-[mdi--check-circle] h-4 w-4 text-emerald-500"
								: "icon-[mdi--alert-circle-outline] h-4 w-4 text-amber-500"
						}
					/>
					<span className={`text-[12px] ${stateClass}`}>{stateText}</span>
				</div>
				{status.supported && (
					<button
						type="button"
						disabled={busy}
						onClick={onReinstall}
						className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						{busy ? (
							<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						) : (
							<span className="icon-[mdi--download-outline] h-3.5 w-3.5 text-muted-foreground" />
						)}
						{status.ready ? labels.fetchAgain : labels.fetch}
					</button>
				)}
			</div>
		</SettingRow>
	);
}

export function EnvironmentSettingsView({ model }: EnvironmentSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6">
				<div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-[20px] font-bold text-foreground">{model.labels.title}</h1>
					<SettingsAiAssist tabId="environment" />
				</div>
				<p className="text-[13px] text-muted-foreground">{model.labels.description}</p>
			</div>

			{model.error && (
				<div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{model.error}
				</div>
			)}

			<SettingSection title={model.labels.sections.runtime} section={SETTINGS_SECTION["environment-runtime"]}>
				{model.status ? (
					<>
						<RuntimeCard
							kind="node"
							status={model.status.node}
							busy={model.busy === "node"}
							labels={model.labels}
							onReinstall={() => void model.actions.reinstall("node")}
						/>
						<RuntimeCard
							kind="python"
							status={model.status.python}
							busy={model.busy === "python"}
							labels={model.labels}
							onReinstall={() => void model.actions.reinstall("python")}
						/>
					</>
				) : (
					<div className="px-5 py-4 text-[12px] text-muted-foreground">{model.labels.loading}</div>
				)}
			</SettingSection>

			<SettingSection title={model.labels.sections.mirrors} section={SETTINGS_SECTION["environment-mirrors"]}>
				<SettingRow title={model.labels.npmRegistry} description={model.labels.npmRegistryDescription} border>
					<span className="text-[12px] text-muted-foreground">{model.status?.mirrors.npmRegistry ?? "—"}</span>
				</SettingRow>
				<SettingRow title={model.labels.pipIndex} description={model.labels.pipIndexDescription} border={false}>
					<span className="text-[12px] text-muted-foreground">{model.status?.mirrors.pipIndexUrl ?? "—"}</span>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
