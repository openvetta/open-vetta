import { Button } from "@vetta/ui";
import { useTranslation } from "react-i18next";
import type { AbilitiesModel, McpAbility } from "../../types";

/**
 * mcp 专属区块：凭证（secrets）与 OAuth 授权状态。
 * 具体表单仍复用设置页既有的 BuiltinMcpSecretsDialog / McpEditDrawer。
 */
export function McpAbilitySection({
	item,
	model,
}: {
	item: McpAbility;
	model: AbilitiesModel;
}): JSX.Element | null {
	const { t } = useTranslation("abilities");
	const secrets = item.preset?.secrets ?? [];

	if (secrets.length === 0 && !item.usesOAuth && !item.canEdit) return null;

	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">{t("mcp.title")}</h2>

			{secrets.length > 0 ? (
				<div className="flex flex-col gap-1.5">
					<p className="text-[12px] text-muted-foreground">{t("mcp.secretsLead")}</p>
					<ul className="flex flex-col gap-1">
						{secrets.map((secret) => (
							<li
								key={secret.envKey}
								className="flex items-center gap-2 rounded-lg border border-border bg-background/50 px-2.5 py-2 text-[12px] text-foreground"
							>
								<span className="icon-[solar--key-minimalistic-square-linear] h-3.5 w-3.5 text-muted-foreground" />
								<code className="font-mono">{secret.envKey}</code>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{item.usesOAuth ? (
				<div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5">
					<div className="min-w-0">
						<div className="text-[12px] font-medium text-foreground">{t("mcp.oauth")}</div>
						<div className="text-[11px] text-muted-foreground">
							{item.authorized ? t("mcp.oauthAuthorized") : t("mcp.oauthNotAuthorized")}
						</div>
					</div>
					<Button
						variant="outline"
						size="sm"
						disabled={item.busy}
						onClick={() => (item.authorized ? model.revokeAuthorization(item) : model.setup(item))}
					>
						{item.authorized ? t("actions.disconnectAccount") : t("actions.connectAccount")}
					</Button>
				</div>
			) : null}

			<div className="flex flex-wrap gap-2">
				{item.canConfigure ? (
					<Button variant="outline" size="sm" disabled={item.busy} onClick={() => model.configure(item)}>
						<span className="icon-[solar--key-minimalistic-square-linear] h-3.5 w-3.5" />
						{t("actions.configure")}
					</Button>
				) : null}
				{item.canEdit ? (
					<Button variant="outline" size="sm" disabled={item.busy} onClick={() => model.edit(item)}>
						<span className="icon-[solar--pen-2-linear] h-3.5 w-3.5" />
						{t("actions.edit")}
					</Button>
				) : null}
			</div>
		</section>
	);
}
