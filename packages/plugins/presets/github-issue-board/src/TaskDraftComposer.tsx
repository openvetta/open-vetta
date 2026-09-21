import { useActiveConversation, type PluginContext } from "@vetta-org/plugin-sdk";
import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import { TaskRefinementService } from "./task-refinement";

const TASK_REFINEMENT_TIMEOUT_MS = 60_000;

const FIELD =
	"w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60";
const ACTION_BUTTON =
	"rounded-lg border border-border px-2 py-1 text-xs font-medium text-foreground disabled:opacity-40";
const PRIMARY_BUTTON =
	"self-start rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40";

export function TaskDraftComposer({
	ctx,
	sourceLabel,
	sourcePlaceholder,
	submitLabel,
	disabled,
	initialValue = "",
	onCancel,
	onSubmit,
}: {
	ctx: PluginContext;
	sourceLabel: string;
	sourcePlaceholder?: string;
	submitLabel: string;
	disabled?: boolean;
	initialValue?: string;
	onCancel?: () => void;
	onSubmit: (promptText: string) => void | Promise<void>;
}): JSX.Element {
	const [draft, setDraft] = useState(initialValue);
	const [preview, setPreview] = useState<string | null>(null);
	const [originalDraft, setOriginalDraft] = useState("");
	const [refining, setRefining] = useState(false);
	const [refineError, setRefineError] = useState<string | null>(null);
	const cancelledRef = useRef(false);
	const refineAbortRef = useRef<AbortController | null>(null);
	const refineGenRef = useRef(0);
	const t = ctx.i18n.t;
	const sessionModel = useActiveConversation().model?.trim() || undefined;
	const currentText = preview !== null ? preview : draft;

	useEffect(() => {
		cancelledRef.current = false;
		return () => {
			cancelledRef.current = true;
			refineAbortRef.current?.abort();
		};
	}, []);

	function refineErrorMessage(error: unknown): string {
		if (error instanceof Error && error.name === "AbortError") {
			return t("board.error.refineTimeout");
		}
		if (error instanceof Error && error.message === "task refinement returned empty content") {
			return t("board.error.refineEmpty");
		}
		const message = error instanceof Error ? error.message : String(error);
		if (
			message.includes("No default AI model is configured") ||
			message.includes("AI model is not available") ||
			message.includes("AI model credentials are unavailable")
		) {
			return t("board.error.refineNoModel");
		}
		return t("board.error.refine");
	}

	async function handleRefine(): Promise<void> {
		const source = draft;
		if (!source.trim() || refining || disabled) return;
		const gen = ++refineGenRef.current;
		setRefining(true);
		setRefineError(null);
		setOriginalDraft(source);
		setPreview("");
		const controller = new AbortController();
		refineAbortRef.current = controller;
		const timer = window.setTimeout(() => controller.abort(), TASK_REFINEMENT_TIMEOUT_MS);
		try {
			const text = await new TaskRefinementService(ctx.ai).refine(source, {
				signal: controller.signal,
				...(sessionModel ? { modelKey: sessionModel } : {}),
				onTextDelta: (next) => {
					if (gen === refineGenRef.current && !cancelledRef.current) setPreview(next);
				},
			});
			if (gen !== refineGenRef.current || cancelledRef.current) return;
			setPreview(text);
		} catch (error) {
			if (gen !== refineGenRef.current || cancelledRef.current) return;
			setPreview(null);
			setRefineError(controller.signal.aborted ? t("board.error.refineTimeout") : refineErrorMessage(error));
		} finally {
			window.clearTimeout(timer);
			if (refineAbortRef.current === controller) refineAbortRef.current = null;
			if (gen === refineGenRef.current && !cancelledRef.current) setRefining(false);
		}
	}

	function handleRestoreOriginal(): void {
		if (refining) return;
		setPreview(null);
		setDraft(originalDraft);
		setRefineError(null);
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		const promptText = currentText.trim();
		if (!promptText || refining || disabled) return;
		await onSubmit(promptText);
		if (cancelledRef.current) return;
		setDraft("");
		setPreview(null);
		setOriginalDraft("");
		setRefineError(null);
	}

	return (
		<form className="flex flex-col gap-2" onSubmit={(event) => void handleSubmit(event)}>
			<label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
				{sourceLabel}
				<textarea
					className={`min-h-[72px] resize-y ${FIELD}`}
					disabled={disabled || refining || preview !== null}
					placeholder={sourcePlaceholder}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
				/>
			</label>
			{preview !== null ? (
				<label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
					{t("board.preview.label")}
					<textarea
						className={`min-h-[72px] resize-y ${FIELD}`}
						disabled={disabled || refining}
						value={preview}
						onChange={(event) => setPreview(event.target.value)}
					/>
				</label>
			) : null}
			{refineError ? <p className="text-xs text-destructive">{refineError}</p> : null}
			<div className="flex flex-wrap items-center gap-1.5">
				<button
					className={ACTION_BUTTON}
					disabled={disabled || refining || draft.trim() === "" || preview !== null}
					type="button"
					onClick={() => void handleRefine()}
				>
					{refining ? t("board.refine.busy") : t("board.refine")}
				</button>
				{preview !== null && !refining ? (
					<button className={ACTION_BUTTON} type="button" onClick={handleRestoreOriginal}>
						{t("board.restoreOriginal")}
					</button>
				) : null}
				<button className={PRIMARY_BUTTON} disabled={disabled || refining || currentText.trim() === ""} type="submit">
					{submitLabel}
				</button>
				{onCancel ? (
					<button className={ACTION_BUTTON} type="button" onClick={onCancel}>
						{t("board.cancel")}
					</button>
				) : null}
			</div>
		</form>
	);
}
