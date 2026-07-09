import { ModelSelect } from "@shared/components/ModelSelect";
import { Input } from "@shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import type { ExecutionModeOverride, SessionExecutionMode } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";
import { normalizeConcurrency, normalizeTimeout } from "../../utils/batchProjectFormData";

export function BatchProjectRuntimeFields({
	concurrency,
	defaultExecutionMode,
	executionMode,
	modelKey,
	sandboxUnavailableReason,
	timeoutMinutes,
	onConcurrencyChange,
	onExecutionModeChange,
	onModelKeyChange,
	onTimeoutChange,
}: {
	concurrency: number | undefined;
	defaultExecutionMode: SessionExecutionMode;
	executionMode: ExecutionModeOverride | undefined;
	modelKey: string | undefined;
	sandboxUnavailableReason: string | null;
	timeoutMinutes: number | undefined;
	onConcurrencyChange: (value: number) => void;
	onExecutionModeChange: (value: ExecutionModeOverride) => void;
	onModelKeyChange: (value: string | undefined) => void;
	onTimeoutChange: (value: number) => void;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");

	return (
		<>
			<div>
				<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
					<span>{t("form.model")}</span>
				</label>
				<ModelSelect
					value={modelKey ?? null}
					onChange={(key) => onModelKeyChange(key ?? undefined)}
					placeholder={t("form.modelSelect")}
					triggerClassName="w-full rounded-md border-border px-3 py-2 text-sm"
				/>
			</div>

			<div className="flex items-end gap-6">
				<div>
					<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
						<span>{t("form.concurrency")}</span>
					</label>
					<Select
						value={String(normalizeConcurrency(concurrency))}
						onValueChange={(nextValue) => onConcurrencyChange(Number(nextValue))}
					>
						<SelectTrigger className="w-24">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="1">1</SelectItem>
							<SelectItem value="2">2</SelectItem>
							<SelectItem value="3">3</SelectItem>
							<SelectItem value="4">4</SelectItem>
							<SelectItem value="5">5</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div>
					<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
						<span>{t("form.timeout")}</span>
					</label>
					<Input
						type="number"
						min={1}
						step={1}
						value={String(normalizeTimeout(timeoutMinutes))}
						onChange={(event) => onTimeoutChange(normalizeTimeout(Number(event.target.value)))}
						className="h-9 w-28"
					/>
				</div>
			</div>
			<p className="text-xs text-muted-foreground/60">{t("form.timeoutHint")}</p>

			<div>
				<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
					<span>{t("form.sandbox")}</span>
				</label>
				<Select value={executionMode ?? "full-access"} onValueChange={(nextValue) => onExecutionModeChange(nextValue as ExecutionModeOverride)}>
					<SelectTrigger className="w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="inherit">
							{t("form.sandboxInherit", {
								mode: defaultExecutionMode === "sandbox" ? t("form.useSandbox") : t("form.fullAccess"),
							})}
						</SelectItem>
						<SelectItem value="full-access">{t("form.fullAccess")}</SelectItem>
						<SelectItem value="sandbox" disabled={Boolean(sandboxUnavailableReason)} title={sandboxUnavailableReason ?? undefined}>
							{t("form.useSandbox")}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</>
	);
}
