import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@vetta/ui";
import { useTranslation } from "react-i18next";
import { McpServerForm } from "./McpServerForm";
import type { McpSettingsModel } from "./useMcpSettingsModel";

/** 编辑已添加 MCP：从右侧滑出 Sheet，替代卡片下方内联展开。 */
export function McpEditDrawer({ model }: { model: McpSettingsModel }): JSX.Element {
	const { t } = useTranslation("settings");
	const open = model.editingServer !== null;
	const name = model.editingServer;

	return (
		<Drawer
			direction="right"
			open={open}
			onOpenChange={(next) => {
				if (!next) model.onCancelEditServer();
			}}
		>
			<DrawerContent className="flex h-full max-h-screen w-[min(28rem,calc(100vw-1.5rem))] flex-col border-l-0 sm:max-w-md">
				<DrawerHeader className="shrink-0 border-b border-border">
					<DrawerTitle>{t("editingServer")}</DrawerTitle>
					<DrawerDescription className="truncate">
						{name ? t("mcpStore.editServerHint", { name }) : t("mcpStore.editServerFallback")}
					</DrawerDescription>
				</DrawerHeader>
				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
					{name ? (
						<McpServerForm
							form={model.serverForm}
							setForm={model.setServerForm}
							onSave={() => void model.onUpdateServer(name)}
							onCancel={model.onCancelEditServer}
							saving={model.saving}
							saveLabel={t("save")}
						/>
					) : null}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
