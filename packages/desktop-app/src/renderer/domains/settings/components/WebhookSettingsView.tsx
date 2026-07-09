import { SETTINGS_SECTION } from "../registry";
import { SettingSection } from "./shared";
import { WebhookEditorDialog } from "./WebhookEditorDialog";
import { WebhookEndpointList } from "./WebhookEndpointList";
import type { WebhookSettingsModel } from "./useWebhookSettingsModel";

export function WebhookSettingsView({ model }: { model: WebhookSettingsModel }): JSX.Element {
	if (model.loading) {
		return (
			<div className="mx-auto w-full max-w-[680px] px-8 py-4">
				<h1 className="mb-6 text-[20px] font-bold text-foreground">{model.labels.title}</h1>
				<div className="text-[13px] text-muted-foreground">{model.labels.loading}</div>
			</div>
		);
	}

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-2 text-[20px] font-bold text-foreground">{model.labels.title}</h1>
			<p className="mb-6 text-[12px] text-muted-foreground">{model.labels.description}</p>

			<SettingSection
				section={SETTINGS_SECTION["webhook-channels"]}
				title={
					<div className="flex items-center justify-between">
						<span>{model.labels.channels}</span>
						<button
							type="button"
							onClick={model.actions.openCreate}
							className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						>
							<span className="icon-[mdi--plus] h-4 w-4" />
							{model.labels.add}
						</button>
					</div>
				}
			>
				<WebhookEndpointList model={model} />
			</SettingSection>

			<WebhookEditorDialog model={model} />
		</div>
	);
}
