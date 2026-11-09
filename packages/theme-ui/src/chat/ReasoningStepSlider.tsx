import { StepSlider } from "@vetta-org/ui/step-slider";
import type { JSX } from "react";
import { useEffect, useState } from "react";

export function ReasoningStepSlider({
	label,
	value,
	levels,
	levelLabel,
	disabled,
	onChange,
}: {
	readonly label: string;
	readonly value: string;
	readonly levels: readonly string[];
	readonly levelLabel: (level: string) => string;
	readonly disabled: boolean;
	readonly onChange: (level: string) => Promise<void> | void;
}): JSX.Element {
	const [draftIndex, setDraftIndex] = useState<number>();
	const levelsKey = levels.join("\u0000");
	useEffect(() => setDraftIndex(undefined), [value, levelsKey]);
	const currentIndex = Math.max(0, levels.indexOf(value));
	const previewIndex = draftIndex ?? currentIndex;
	const previewLevel = levels[previewIndex];

	function commit(index: number) {
		if (disabled) return;
		const level = levels[index];
		if (!level || level === value) {
			setDraftIndex(undefined);
			return;
		}
		setDraftIndex(index);
		void Promise.resolve(onChange(level)).then(
			() => setDraftIndex(undefined),
			() => setDraftIndex(undefined),
		);
	}

	return (
		<div role="group" aria-label={label} className="space-y-2 border-b border-border/50 pb-3">
			<div className="flex items-center justify-between gap-2 text-[12px]">
				<span>{label}</span>
				<span className="font-medium text-foreground" aria-live="polite">
					{previewLevel ? levelLabel(previewLevel) : null}
				</span>
			</div>
			<StepSlider
				labels={levels.map(levelLabel)}
				index={previewIndex}
				disabled={disabled}
				aria-label={label}
				aria-valuetext={previewLevel ? levelLabel(previewLevel) : undefined}
				onIndexChange={setDraftIndex}
				onIndexCommit={commit}
				onCancel={() => setDraftIndex(undefined)}
			/>
		</div>
	);
}
