import { useState, type JSX } from "react";
import { Button } from "@vetta/ui";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface BuiltinMcpPresetRowView {
	readonly id: string;
	readonly name: string;
	readonly displayName: string;
	readonly description: string;
	readonly iconUrl: string;
	readonly needsKey: boolean;
}

export interface BuiltinMcpSectionViewLabels {
	readonly listTitle: string;
	readonly sectionHint: string;
	readonly allAdded: string;
	readonly added: string;
	readonly processing: string;
	readonly connect: string;
	readonly add: string;
	readonly remove: string;
}

export interface BuiltinMcpSectionViewProps {
	readonly items: readonly BuiltinMcpPresetRowView[];
	readonly addedNames: Set<string>;
	readonly busyName: string | null;
	readonly variant: "full" | "discover";
	readonly section: SettingSectionMeta;
	readonly labels: BuiltinMcpSectionViewLabels;
	readonly onAdd: (name: string) => void;
	readonly onRemove: (name: string) => void;
}

export function BuiltinMcpSectionView({
	items,
	addedNames,
	busyName,
	variant,
	section,
	labels,
	onAdd,
	onRemove,
}: BuiltinMcpSectionViewProps): JSX.Element {
	return (
		<div>
			{variant === "full" && (
				<div className="mb-3">
					<div className="text-[12px] font-medium text-foreground">{labels.listTitle}</div>
					<p className="mt-0.5 text-[11px] text-muted-foreground">{labels.sectionHint}</p>
				</div>
			)}

			<SettingSection section={section} title="">
				{items.length === 0 ? (
					<div className="px-5 py-8 text-center text-[12px] text-muted-foreground">{labels.allAdded}</div>
				) : (
					items.map((preset) => (
						<BuiltinMcpRow
							key={preset.id}
							preset={preset}
							added={addedNames.has(preset.name)}
							busy={busyName === preset.name}
							discover={variant === "discover"}
							labels={labels}
							onAdd={() => onAdd(preset.name)}
							onRemove={() => onRemove(preset.name)}
						/>
					))
				)}
			</SettingSection>
		</div>
	);
}

function BuiltinMcpRow({
	preset,
	added,
	busy,
	discover,
	labels,
	onAdd,
	onRemove,
}: {
	preset: BuiltinMcpPresetRowView;
	added: boolean;
	busy: boolean;
	discover: boolean;
	labels: BuiltinMcpSectionViewLabels;
	onAdd: () => void;
	onRemove: () => void;
}): JSX.Element {
	const [imgFailed, setImgFailed] = useState(false);

	return (
		<div className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
			{!imgFailed ? (
				<img
					src={preset.iconUrl}
					alt=""
					className="h-9 w-9 shrink-0 object-contain"
					onError={() => setImgFailed(true)}
				/>
			) : (
				<span className="icon-[mdi--puzzle-outline] h-9 w-9 shrink-0 text-muted-foreground" />
			)}
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-[13px] font-medium text-foreground">{preset.displayName}</span>
					{!discover && added && (
						<span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
							{labels.added}
						</span>
					)}
				</div>
				<p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{preset.description}</p>
			</div>
			{discover || !added ? (
				<Button variant="primary" size="sm" disabled={busy} onClick={onAdd}>
					{busy ? labels.processing : preset.needsKey ? labels.connect : labels.add}
				</Button>
			) : (
				<Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
					{busy ? labels.processing : labels.remove}
				</Button>
			)}
		</div>
	);
}
