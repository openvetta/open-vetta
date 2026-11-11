import { SplashOptionRow } from "@vetta-org/theme-ui/overlays/SplashOptionRow";
import { SplashPanel } from "@vetta-org/theme-ui/overlays/SplashPanel";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { AddProjectMenuItemModel } from "./types";

interface AddProjectSplashDialogProps {
	open: boolean;
	items: AddProjectMenuItemModel[];
	onClose: () => void;
}

/** 「添加项目」选择面板：与 ⌘K 共用 SplashPanel 外壳，每个入口带一句描述。 */
export function AddProjectSplashDialog({ open, items, onClose }: AddProjectSplashDialogProps): JSX.Element {
	const { t } = useTranslation("project");

	// 外壳不接管快捷键（⌘K 的 Esc 走宿主 scope），这里自己补一个。
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	return (
		<SplashPanel
			open={open}
			onClose={onClose}
			label={t("addProjectSplash.title")}
			width="480px"
			header={
				<div className="flex h-12 shrink-0 items-center border-b border-border/60 px-3.5 text-[14px] text-foreground">
					{t("addProjectSplash.title")}
				</div>
			}
		>
			<div className="flex flex-col gap-0.5 px-1.5 py-1.5">
				{items.map((item) => (
					<SplashOptionRow
						key={item.action}
						icon={item.icon}
						title={t(item.labelKey)}
						description={t(item.descriptionKey)}
						onSelect={item.onSelect}
					/>
				))}
			</div>
		</SplashPanel>
	);
}
