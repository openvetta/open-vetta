import { PresetProvidersSectionView as ThemePresetProvidersSectionView } from "@vetta-org/theme-ui/settings";
import { useTranslation } from "react-i18next";
import { GROK_PRESET_PROVIDER_ID } from "../../../../shared/grok-oauth.js";
import { SETTINGS_SECTION } from "../registry";
import { GrokSubscriptionDialog } from "./GrokSubscriptionDialog";
import { PresetProviderRow } from "./PresetProviderRow";
import type { PresetProvidersSectionModel } from "./usePresetProvidersSectionModel";

export function PresetProvidersSectionView({ model }: { model: PresetProvidersSectionModel }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<>
			<ThemePresetProvidersSectionView
				section={SETTINGS_SECTION["models-preset-providers"]}
				labels={model.labels}
				error={model.error}
				hasRows={model.rows.length > 0}
				loading={model.loading}
				refreshingCatalog={model.refreshingCatalog}
				onRefreshCatalog={() => void model.onRefreshCatalog()}
				rows={model.rows.map((row) => (
					<PresetProviderRow
						key={row.id}
						row={row}
						draftKey={model.draftKeys[row.id] ?? ""}
						saving={model.saving}
						labels={model.labels}
						onToggleExpanded={model.onToggleExpanded}
						onToggleEditor={model.onToggleEditor}
						onDraftKeyChange={model.onDraftKeyChange}
						onAdopt={model.onAdopt}
						onRemove={model.onRemove}
						onRefreshModels={model.onRefreshModels}
						onCopyApiKey={model.onCopyApiKey}
						subscriptionLogin={
							row.id === GROK_PRESET_PROVIDER_ID
								? {
										loggedIn: model.grokLoggedIn,
										busy: model.grokBusy,
										loginLabel: t("grokSubscriptionLogin"),
										logoutLabel: t("grokSubscriptionLogout"),
										onLogin: () => void model.onGrokLogin(),
										onLogout: () => void model.onGrokLogout(),
									}
								: undefined
						}
					/>
				))}
			/>
			<GrokSubscriptionDialog
				state={model.grokDialog}
				onCancel={model.onGrokDialogCancel}
				onOpenPage={model.onGrokOpenPage}
				onCopyCode={model.onGrokCopyCode}
			/>
		</>
	);
}
