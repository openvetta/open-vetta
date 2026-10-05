import { Button } from "@shared/components/ui/button";
import { SettingSection, SettingsPageShellView } from "@vetta-org/theme-ui/settings";
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import type { WebhookSettingsModel } from "./useWebhookSettingsModel";
import { WebhookEditorDialog } from "./WebhookEditorDialog";
import { WebhookEndpointList } from "./WebhookEndpointList";

export function WebhookSettingsView({ model }: { model: WebhookSettingsModel }): JSX.Element {
	return (
		<SettingsPageShellView
			title={model.labels.title}
			description={model.loading ? undefined : model.labels.description}
			headerAction={model.loading ? undefined : <SettingsAiAssist tabId="webhook" />}
			loading={model.loading}
			loadingLabel={model.labels.loading}
		>
			{!model.loading && (
				<>
					<SettingSection
						section={SETTINGS_SECTION["webhook-channels"]}
						title={
							<div className="flex items-center justify-between">
								<span>{model.labels.channels}</span>
								<Button type="button" onClick={model.actions.openCreate} variant="primary" size="sm">
									<span className="icon-[solar--add-circle-linear] h-4 w-4" />
									{model.labels.add}
								</Button>
							</div>
						}
					>
						<WebhookEndpointList model={model} />
					</SettingSection>
					<WebhookEditorDialog model={model} />
				</>
			)}
		</SettingsPageShellView>
	);
}
