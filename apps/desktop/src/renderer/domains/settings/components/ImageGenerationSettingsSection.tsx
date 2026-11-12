import { CheckboxField, InputField, MotionSelect, SettingRow, SettingSection } from "@vetta-org/theme-ui/settings";
import { SETTINGS_SECTION } from "../registry";
import type { ImageGenerationSettingsModel } from "./useImageGenerationSettingsModel";

function CustomProviderForm({ model }: { model: ImageGenerationSettingsModel["custom"] }): JSX.Element | null {
	const { draft, labels } = model;
	if (!draft) return null;
	const field = (title: string, input: JSX.Element): JSX.Element => (
		<label className="flex flex-col gap-1">
			<span className="text-[12px] font-medium text-muted-foreground">{title}</span>
			{input}
		</label>
	);
	return (
		<form
			className="flex flex-col gap-3 border-t border-border px-5 py-4"
			onSubmit={(event) => {
				event.preventDefault();
				void model.save();
			}}
		>
			{field(
				labels.name,
				<InputField
					value={draft.name}
					onChange={(name) => model.updateDraft({ name })}
					aria-label={labels.name}
					autoFocus
				/>,
			)}
			{field(
				labels.baseUrl,
				<InputField
					value={draft.baseUrl}
					onChange={(baseUrl) => model.updateDraft({ baseUrl })}
					placeholder="https://api.example.com/v1"
					aria-label={labels.baseUrl}
				/>,
			)}
			{field(
				labels.apiKey,
				<InputField
					type="password"
					value={draft.apiKey}
					onChange={(apiKey) => model.updateDraft({ apiKey })}
					placeholder={draft.hasStoredApiKey ? labels.apiKeyKeepHint : "sk-…"}
					aria-label={labels.apiKey}
				/>,
			)}
			{field(
				labels.model,
				<InputField
					value={draft.model}
					onChange={(modelName) => model.updateDraft({ model: modelName })}
					placeholder="gpt-image-1"
					aria-label={labels.model}
				/>,
			)}
			<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
				<CheckboxField
					checked={draft.supportsTextToImage}
					onChange={(supportsTextToImage) => model.updateDraft({ supportsTextToImage })}
					label={labels.supportsTextToImage}
				/>
				<CheckboxField
					checked={draft.supportsImageToImage}
					onChange={(supportsImageToImage) => model.updateDraft({ supportsImageToImage })}
					label={labels.supportsImageToImage}
				/>
			</div>
			{model.error && (
				<p role="alert" className="text-[12px] text-destructive">
					{model.error}
				</p>
			)}
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={model.cancel}
					className="h-8 rounded-lg border border-border px-3 text-[12px] hover:bg-accent"
				>
					{labels.cancel}
				</button>
				<button
					type="submit"
					disabled={model.saving}
					className="h-8 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50"
				>
					{labels.save}
				</button>
			</div>
		</form>
	);
}

function CustomProviderList({ model }: { model: ImageGenerationSettingsModel["custom"] }): JSX.Element {
	const { labels } = model;
	return (
		<div className="border-t border-border">
			<div className="flex items-center justify-between gap-6 px-5 py-4">
				<div className="min-w-0 flex-1">
					<div className="text-[13px] font-medium text-foreground">{labels.title}</div>
					<div className="mt-0.5 text-[12px] text-muted-foreground">{labels.description}</div>
				</div>
				{!model.draft && (
					<button
						type="button"
						onClick={model.startAdd}
						className="h-8 shrink-0 rounded-lg border border-border px-3 text-[12px] hover:bg-accent"
					>
						{labels.add}
					</button>
				)}
			</div>
			{model.providers.map((provider) => (
				<div key={provider.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
					<div className="min-w-0 flex-1">
						<div className="truncate text-[13px] text-foreground" title={provider.name}>
							{provider.name} · {provider.model}
						</div>
						<div className="truncate text-[12px] text-muted-foreground" title={provider.baseUrl}>
							{provider.baseUrl}
						</div>
					</div>
					<div className="flex shrink-0 gap-2">
						<button
							type="button"
							onClick={() => model.startEdit(provider.id)}
							className="h-7 rounded-lg px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
						>
							{labels.edit}
						</button>
						<button
							type="button"
							onClick={() => void model.remove(provider.id)}
							className="h-7 rounded-lg px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-destructive"
						>
							{labels.delete}
						</button>
					</div>
				</div>
			))}
			<CustomProviderForm model={model} />
		</div>
	);
}

export function ImageGenerationSettingsSection({ model }: { model: ImageGenerationSettingsModel }): JSX.Element {
	const hasTextToImageOptions = model.textToImageOptions.length > 1;
	const hasImageToImageOptions = model.imageToImageOptions.length > 1;
	return (
		<div className="mt-6">
			<SettingSection
				title={model.labels.title}
				section={SETTINGS_SECTION["agent-images"]}
				description={model.labels.description}
			>
				{model.loading ? (
					<p className="px-1 py-3 text-[12px] text-muted-foreground">{model.labels.loading}</p>
				) : (
					<>
						<SettingRow
							title={model.labels.textToImage}
							description={hasTextToImageOptions ? undefined : model.labels.noProviders}
						>
							<MotionSelect
								value={model.textToImageRouteId}
								onValueChange={(value) => void model.actions.setTextToImageRoute(value)}
								options={model.textToImageOptions}
								disabled={!hasTextToImageOptions}
								aria-label={model.labels.textToImage}
							/>
						</SettingRow>
						<SettingRow
							title={model.labels.imageToImage}
							description={hasImageToImageOptions ? undefined : model.labels.noProviders}
							border={false}
						>
							<MotionSelect
								value={model.imageToImageRouteId}
								onValueChange={(value) => void model.actions.setImageToImageRoute(value)}
								options={model.imageToImageOptions}
								disabled={!hasImageToImageOptions}
								aria-label={model.labels.imageToImage}
							/>
						</SettingRow>
						<CustomProviderList model={model.custom} />
					</>
				)}
			</SettingSection>
		</div>
	);
}
