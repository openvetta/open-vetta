import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import { eventToShortcut, formatShortcut } from "@shared/lib/platform";
import {
	SHORTCUT_ACTIONS,
	getEffectiveShortcut,
	loadShortcuts,
	saveShortcuts,
	type ShortcutMap,
} from "@shared/lib/shortcuts";
import { SettingRow, SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";

function ShortcutRecorder({
	value,
	onChange,
	onReset,
	isDefault,
	t,
}: {
	value: string;
	onChange: (shortcut: string) => void;
	onReset: () => void;
	isDefault: boolean;
	t: (key: any) => string;
}): JSX.Element {
	const [recording, setRecording] = useState(false);
	const [pendingKeys, setPendingKeys] = useState<string | null>(null);
	const inputRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!recording) return;

		function handleKeyDown(e: KeyboardEvent) {
			e.preventDefault();
			e.stopPropagation();

			const shortcut = eventToShortcut(e);
			if (!shortcut) return; // bare modifier press

			setPendingKeys(shortcut);
			onChange(shortcut);
			setRecording(false);
		}

		function handleBlur() {
			setRecording(false);
			setPendingKeys(null);
		}

		document.addEventListener("keydown", handleKeyDown, true);
		inputRef.current?.addEventListener("blur", handleBlur);
		const btn = inputRef.current;

		return () => {
			document.removeEventListener("keydown", handleKeyDown, true);
			btn?.removeEventListener("blur", handleBlur);
		};
	}, [recording, onChange]);

	const displayValue = pendingKeys
		? formatShortcut(pendingKeys)
		: formatShortcut(value);

	return (
		<div className="flex items-center gap-2">
			<button
				ref={inputRef}
				type="button"
				onClick={() => {
					setRecording(true);
					setPendingKeys(null);
				}}
				className={cn(
					"flex h-[30px] min-w-[120px] items-center justify-center rounded-lg border px-3 text-[12px] font-mono transition-all",
					recording
						? "border-primary bg-primary/10 text-foreground animate-pulse"
						: "border-input bg-muted text-foreground hover:bg-secondary",
				)}
			>
				{recording ? t("shortcutPlaceholder") : displayValue}
			</button>
			{!isDefault && (
				<button
					type="button"
					onClick={onReset}
					className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
					title={t("reset")}
				>
					<span className="icon-[mdi--restore] h-3.5 w-3.5" />
				</button>
			)}
		</div>
	);
}

export function ShortcutsSettings(): JSX.Element {
	const { t } = useTranslation("settings");
	const [customShortcuts, setCustomShortcuts] = useState<ShortcutMap>(loadShortcuts);

	const handleChange = useCallback((actionId: string, shortcut: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev, [actionId]: shortcut };
			saveShortcuts(next);
			return next;
		});
	}, []);

	const handleReset = useCallback((actionId: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev };
			delete next[actionId];
			saveShortcuts(next);
			return next;
		});
	}, []);

	const handleResetAll = useCallback(() => {
		setCustomShortcuts({});
		saveShortcuts({});
	}, []);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<div className="mb-6 flex items-center justify-between">
				<h1 className="text-[20px] font-bold text-foreground">{t("shortcuts")}</h1>
				<button
					type="button"
					onClick={handleResetAll}
					className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<span className="icon-[mdi--restore] h-3.5 w-3.5" />
					{t("resetAllShortcuts")}
				</button>
			</div>

			<SettingSection t={t as any} section={SETTINGS_SECTION["shortcuts-global"]}>
				{SHORTCUT_ACTIONS.map((action, idx) => {
					const effective = getEffectiveShortcut(action.id, customShortcuts);
					const isDefault = !customShortcuts[action.id];

					return (
						<SettingRow
							key={action.id}
							title={t(action.labelKey)}
							description={t(action.descriptionKey)}
							border={idx < SHORTCUT_ACTIONS.length - 1}
						>
							<ShortcutRecorder
								value={effective}
								onChange={(s) => handleChange(action.id, s)}
								onReset={() => handleReset(action.id)}
								isDefault={isDefault}
								t={t as any}
							/>
						</SettingRow>
					);
				})}
			</SettingSection>

			<p className="mt-4 text-[12px] leading-relaxed text-muted-foreground/50">
				{t("shortcutHint")}
			</p>
		</div>
	);
}
