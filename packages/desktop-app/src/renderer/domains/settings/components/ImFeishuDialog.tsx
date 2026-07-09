import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { cn } from "@shared/lib/utils";
import type { ImBridgeSettingsModel } from "./useImBridgeSettingsModel";

export function ImFeishuDialog({ model }: { model: ImBridgeSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<Dialog open={model.feishuDialogOpen} onOpenChange={model.setFeishuDialogOpen}>
			<DialogContent className="sm:max-w-[460px]">
				<DialogHeader>
					<DialogTitle>{t("feishuSettingsTitle")}</DialogTitle>
					<DialogDescription>{t("feishuDesc")}</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-2">
					<div>
						<label className="mb-1 block text-[12px] font-medium text-foreground">App ID</label>
						<input
							type="text"
							value={model.feishuForm.appId}
							onChange={(event) => model.updateFeishuField("appId", event.target.value)}
							className={cn(
								"w-full rounded-md border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground",
								model.feishuValidation.errors.appId ? "border-destructive" : "border-input",
							)}
							placeholder="cli_xxxxxxxxxxxxxxxx"
						/>
					</div>
					<div>
						<label className="mb-1 block text-[12px] font-medium text-foreground">App Secret</label>
						<div className="flex items-center gap-1.5">
							<input
								type={model.showSecret ? "text" : "password"}
								value={model.feishuForm.appSecret}
								onChange={(event) => model.updateFeishuField("appSecret", event.target.value)}
								className={cn(
									"flex-1 rounded-md border bg-secondary px-2.5 py-1.5 text-[12px] text-foreground",
									model.feishuValidation.errors.appSecret ? "border-destructive" : "border-input",
								)}
								placeholder="App Secret"
							/>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => model.setShowSecret((value) => !value)}
								aria-label={model.showSecret ? t("hide") : t("show")}
							>
								<span
									className={cn(
										model.showSecret ? "icon-[mdi--eye-off-outline]" : "icon-[mdi--eye-outline]",
										"h-3.5 w-3.5",
									)}
								/>
							</Button>
						</div>
					</div>

					<div className="min-h-[18px] text-[12px]">
						{model.saveError && <span className="text-destructive">{model.saveError}</span>}
						{model.saveOk && !model.saveError && <span className="text-emerald-400">{model.saveOk}</span>}
						{model.testResult && !model.saveError && !model.saveOk && (
							<span className="text-muted-foreground">{model.testResult}</span>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => void model.onTestFeishu()}
						disabled={model.testing || !model.feishuValidation.valid}
					>
						{model.testing ? t("testing") : t("testConnection")}
					</Button>
					<Button
						variant="primary"
						onClick={() => void model.onSaveFeishu()}
						disabled={!model.feishuValidation.valid || model.saving}
					>
						{model.saving ? t("savingLabel") : t("saveLabel")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
