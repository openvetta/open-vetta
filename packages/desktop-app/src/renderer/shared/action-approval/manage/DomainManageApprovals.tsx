import { DownloadsCancelApproval } from "./downloads";
import { ImRestartApproval, ImSetAgentModelApproval, ImSetEnabledApproval } from "./im";
import {
	KnowledgeAddFilesApproval,
	KnowledgeCreateApproval,
	KnowledgeDeleteApproval,
	KnowledgeDeleteEntryApproval,
	KnowledgeRenameApproval,
	KnowledgeRetryFailedApproval,
	KnowledgeScanNowApproval,
} from "./knowledge";
import { McpRemoveApproval, McpSetEnabledApproval, McpUpsertApproval } from "./mcp";
import {
	ModelsRemoveProviderApproval,
	ModelsSetDefaultApproval,
	ModelsUpsertProviderApproval,
} from "./models";
import {
	PluginsInstallFromUrlApproval,
	PluginsReloadApproval,
	PluginsSetEnabledApproval,
	PluginsUninstallApproval,
} from "./plugins";
import {
	ProjectsArchiveApproval,
	ProjectsCreateApproval,
	ProjectsOpenApproval,
	ProjectsRemoveApproval,
	ProjectsRenameApproval,
	ProjectsUnarchiveApproval,
} from "./projects";
import {
	SettingsSetExecutionModeApproval,
	SettingsSetExperimentalApproval,
	SettingsSetKnowledgeBaseApproval,
	SettingsSetLanguageApproval,
	SettingsSetNotificationsApproval,
	SettingsSetWorkspaceApproval,
} from "./settings";
import { SkillsSetEnabledApproval, SkillsUninstallApproval } from "./skills";
import {
	UpdaterCancelApproval,
	UpdaterCheckApproval,
	UpdaterDismissApproval,
	UpdaterDownloadApproval,
	UpdaterInstallApproval,
} from "./updater";
import {
	WebhookCreateApproval,
	WebhookDeleteApproval,
	WebhookSendApproval,
	WebhookSetEnabledApproval,
	WebhookTestApproval,
	WebhookUpdateApproval,
} from "./webhook";

/**
 * 挂载全部领域 manage 审批 presenter。
 * 按 operation 拆分（对齐 scheduler）：每个组件只绑定一个 presentation。
 */
export function DomainManageApprovals(): JSX.Element {
	return (
		<>
			<ModelsSetDefaultApproval />
			<ModelsUpsertProviderApproval />
			<ModelsRemoveProviderApproval />

			<McpUpsertApproval />
			<McpSetEnabledApproval />
			<McpRemoveApproval />

			<SkillsSetEnabledApproval />
			<SkillsUninstallApproval />

			<ProjectsCreateApproval />
			<ProjectsOpenApproval />
			<ProjectsRenameApproval />
			<ProjectsArchiveApproval />
			<ProjectsUnarchiveApproval />
			<ProjectsRemoveApproval />

			<SettingsSetLanguageApproval />
			<SettingsSetNotificationsApproval />
			<SettingsSetExecutionModeApproval />
			<SettingsSetWorkspaceApproval />
			<SettingsSetExperimentalApproval />
			<SettingsSetKnowledgeBaseApproval />

			<KnowledgeCreateApproval />
			<KnowledgeRenameApproval />
			<KnowledgeDeleteApproval />
			<KnowledgeAddFilesApproval />
			<KnowledgeDeleteEntryApproval />
			<KnowledgeScanNowApproval />
			<KnowledgeRetryFailedApproval />

			<PluginsSetEnabledApproval />
			<PluginsInstallFromUrlApproval />
			<PluginsUninstallApproval />
			<PluginsReloadApproval />

			<ImSetEnabledApproval />
			<ImRestartApproval />
			<ImSetAgentModelApproval />

			<WebhookCreateApproval />
			<WebhookUpdateApproval />
			<WebhookSetEnabledApproval />
			<WebhookDeleteApproval />
			<WebhookTestApproval />
			<WebhookSendApproval />

			<DownloadsCancelApproval />

			<UpdaterCheckApproval />
			<UpdaterDownloadApproval />
			<UpdaterInstallApproval />
			<UpdaterDismissApproval />
			<UpdaterCancelApproval />
		</>
	);
}
