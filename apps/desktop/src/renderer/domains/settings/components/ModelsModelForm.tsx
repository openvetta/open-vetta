import { getReasoningPreset } from "@vetta/ai/reasoning-presets";
import { InputField, SelectField } from "@vetta-org/theme-ui/settings";
import { Button } from "@vetta-org/ui";
import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CheckboxField } from "./McpSettings";
import { MODEL_PRICE_FIELDS, type ModelPriceField, parseModelPrice } from "./modelPriceDraft";
import { CONTEXT_WINDOW_PICKS, MAX_OUTPUT_PICKS, NumberQuickPicks } from "./NumberQuickPicks";
import {
	buildModelApiOptions,
	CANDIDATE_REASONING_LEVELS,
	INPUT_OPTIONS,
	type ModelFormState,
} from "./useModelsSettingsModel";

const PRICE_LABEL_KEYS = {
	input: "costInput",
	output: "costOutput",
	cacheRead: "costCacheRead",
	cacheWrite: "costCacheWrite",
} as const satisfies Record<ModelPriceField, string>;

export function ModelsModelForm({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	saveLabel,
}: {
	form: ModelFormState;
	setForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	saveLabel: string;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const formId = useId();
	const inheritLabel = t("inheritedFromProvider");
	const apiOptions = useMemo(() => buildModelApiOptions(form.api, inheritLabel), [form.api, inheritLabel]);
	const invalidPrice = parseModelPrice(form.price) === null;

	const toggleInput = (value: string) => {
		setForm((current) => {
			const has = current.input.includes(value);
			return { ...current, input: has ? current.input.filter((item) => item !== value) : [...current.input, value] };
		});
	};

	return (
		<>
			<div className="grid grid-cols-2 gap-3">
				<div>
					<label htmlFor={`${formId}-modelId`} className="mb-1 block text-[11px] text-muted-foreground">
						{t("modelId")}
					</label>
					<InputField
						id={`${formId}-modelId`}
						aria-label={t("modelId")}
						value={form.id}
						onChange={(value) => setForm((current) => ({ ...current, id: value }))}
						placeholder={t("modelIdPlaceholder")}
					/>
				</div>
				<div>
					<label htmlFor={`${formId}-displayName`} className="mb-1 block text-[11px] text-muted-foreground">
						{t("displayName")}
					</label>
					<InputField
						id={`${formId}-displayName`}
						aria-label={t("displayName")}
						value={form.name}
						onChange={(value) => setForm((current) => ({ ...current, name: value }))}
						placeholder={t("optional")}
					/>
				</div>
				<div>
					<label htmlFor={`${formId}-apiType`} className="mb-1 block text-[11px] text-muted-foreground">
						{t("apiType")}
					</label>
					<SelectField
						id={`${formId}-apiType`}
						aria-label={t("apiType")}
						value={form.api}
						onChange={(value) => setForm((current) => ({ ...current, api: value }))}
						options={apiOptions}
					/>
				</div>
				<fieldset className="min-w-0">
					<legend className="mb-1 block text-[11px] text-muted-foreground">{t("inputCapability")}</legend>
					<div className="flex h-8 items-center gap-3">
						{INPUT_OPTIONS.map((option) => (
							<CheckboxField
								key={option.value}
								checked={form.input.includes(option.value)}
								onChange={() => toggleInput(option.value)}
								label={option.label}
							/>
						))}
					</div>
				</fieldset>
				<div>
					<label htmlFor={`${formId}-contextWindow`} className="mb-1 block text-[11px] text-muted-foreground">
						{t("contextWindow")}
					</label>
					<InputField
						id={`${formId}-contextWindow`}
						aria-label={t("contextWindow")}
						value={form.contextWindow}
						onChange={(value) => setForm((current) => ({ ...current, contextWindow: value }))}
						placeholder={t("contextWindowPlaceholder")}
					/>
					<NumberQuickPicks
						picks={CONTEXT_WINDOW_PICKS}
						current={form.contextWindow}
						onPick={(value) => setForm((current) => ({ ...current, contextWindow: value }))}
					/>
				</div>
				<div>
					<label htmlFor={`${formId}-maxOutputTokens`} className="mb-1 block text-[11px] text-muted-foreground">
						{t("maxOutputTokens")}
					</label>
					<InputField
						id={`${formId}-maxOutputTokens`}
						aria-label={t("maxOutputTokens")}
						value={form.maxTokens}
						onChange={(value) => setForm((current) => ({ ...current, maxTokens: value }))}
						placeholder={t("maxOutputTokensPlaceholder")}
					/>
					<NumberQuickPicks
						picks={MAX_OUTPUT_PICKS}
						current={form.maxTokens}
						onPick={(value) => setForm((current) => ({ ...current, maxTokens: value }))}
					/>
				</div>
				<div className="col-span-2">
					<div className="mb-1 text-[11px] text-muted-foreground">
						{t("modelPriceTitle")} · USD {t("perMillionTokens")}
					</div>
					<div className="grid grid-cols-2 gap-3">
						{MODEL_PRICE_FIELDS.map((field) => (
							<label
								key={field}
								htmlFor={`${formId}-price-${field}`}
								className="block text-[11px] text-muted-foreground"
							>
								<span className="mb-1 block">{t(PRICE_LABEL_KEYS[field])}</span>
								<InputField
									id={`${formId}-price-${field}`}
									value={form.price[field]}
									onChange={(value) =>
										setForm((current) => ({ ...current, price: { ...current.price, [field]: value } }))
									}
									placeholder="0"
									aria-label={t(PRICE_LABEL_KEYS[field])}
								/>
							</label>
						))}
					</div>
					<p className="mt-1 text-[11px] text-muted-foreground">{t("modelPriceHint")}</p>
					{invalidPrice && <p className="mt-1 text-[11px] text-destructive">{t("modelPriceInvalid")}</p>}
				</div>
				<div className="col-span-2">
					<CheckboxField
						checked={form.reasoning}
						onChange={(value) => setForm((current) => ({ ...current, reasoning: value }))}
						label={t("supportsReasoning")}
					/>
				</div>
				{form.reasoning && <ReasoningLevelsEditor form={form} setForm={setForm} />}
			</div>
			<div className="mt-3 flex justify-end gap-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t("cancel")}
				</Button>
				<Button variant="primary" size="sm" onClick={onSave} disabled={!form.id.trim() || saving || invalidPrice}>
					{saveLabel}
				</Button>
			</div>
		</>
	);
}

function ReasoningLevelsEditor({
	form,
	setForm,
}: {
	form: ModelFormState;
	setForm: React.Dispatch<React.SetStateAction<ModelFormState>>;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const candidates = [
		...new Set([...(getReasoningPreset(form.api)?.levels ?? []), ...CANDIDATE_REASONING_LEVELS]),
	].filter((candidate) => !form.reasoningLevels.includes(candidate));

	return (
		<fieldset className="col-span-2 min-w-0">
			<legend className="mb-1 block text-[11px] text-muted-foreground">{t("reasoningLevels")}</legend>
			<div className="space-y-1.5">
				{form.reasoningLevels.length === 0 && (
					<p className="text-[11px] text-muted-foreground/70">{t("reasoningLevelsEmpty")}</p>
				)}
				{form.reasoningLevels.map((level, index) => (
					<div key={index} className="flex items-center gap-2">
						<InputField
							aria-label={t("reasoningLevels")}
							value={level}
							onChange={(value) =>
								setForm((current) => {
									const levels = [...current.reasoningLevels];
									const prev = levels[index];
									levels[index] = value;
									return {
										...current,
										reasoningLevels: levels,
										defaultReasoningLevel:
											current.defaultReasoningLevel === prev ? value : current.defaultReasoningLevel,
									};
								})
							}
							placeholder="low / medium / high / max"
						/>
						<Button
							variant="outline"
							size="xs"
							disabled={!level.trim()}
							aria-pressed={form.defaultReasoningLevel === level && Boolean(level.trim())}
							onClick={() => setForm((current) => ({ ...current, defaultReasoningLevel: level }))}
							className={
								form.defaultReasoningLevel === level && level.trim()
									? "border-primary/40 bg-primary/10 text-primary"
									: ""
							}
						>
							{t("reasoningDefault")}
						</Button>
						<Button
							variant="outline"
							size="xs"
							onClick={() =>
								setForm((current) => {
									const removed = current.reasoningLevels[index];
									const levels = current.reasoningLevels.filter((_, itemIndex) => itemIndex !== index);
									return {
										...current,
										reasoningLevels: levels,
										defaultReasoningLevel:
											current.defaultReasoningLevel === removed
												? (levels[0] ?? "")
												: current.defaultReasoningLevel,
									};
								})
							}
						>
							{t("reasoningRemove")}
						</Button>
					</div>
				))}
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="xs"
						onClick={() =>
							setForm((current) => ({ ...current, reasoningLevels: [...current.reasoningLevels, ""] }))
						}
					>
						{t("reasoningAdd")}
					</Button>
					{getReasoningPreset(form.api) && (
						<Button
							variant="outline"
							size="xs"
							onClick={() => {
								const preset = getReasoningPreset(form.api);
								if (preset) {
									setForm((current) => ({
										...current,
										reasoningLevels: [...preset.levels],
										defaultReasoningLevel: preset.default,
									}));
								}
							}}
						>
							{t("reasoningLoadPreset")}
						</Button>
					)}
				</div>
				{candidates.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						<span className="text-[11px] text-muted-foreground">{t("reasoningCandidates")}</span>
						{candidates.map((candidate) => (
							<Button
								key={candidate}
								variant="outline"
								size="xs"
								onClick={() =>
									setForm((current) =>
										current.reasoningLevels.includes(candidate)
											? current
											: { ...current, reasoningLevels: [...current.reasoningLevels, candidate] },
									)
								}
							>
								+ {candidate}
							</Button>
						))}
					</div>
				)}
			</div>
		</fieldset>
	);
}
