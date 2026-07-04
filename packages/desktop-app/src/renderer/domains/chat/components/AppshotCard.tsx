import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { filePreviewAtom } from "@shared/store/atoms";
import { pathBasename } from "@shared/lib/utils";

/** Appshot 附件展示数据（输入框待发送 / 已发送消息共用）。 */
export interface AppshotCardData {
	imagePath: string | null;
	iconPath?: string | null;
	appName?: string;
	windowTitle?: string;
	documentPath?: string | null;
}

function mediaUrl(path: string): string {
	return `vetta-media://local/stream?${new URLSearchParams({ path }).toString()}`;
}

/**
 * Appshot 组合预览卡：截图缩略图 + 水平居中骑边的 app 图标 + 文件名。
 * 点击缩略图呼起全局图片预览；传入 onRemove 时右上角显示移除按钮（输入框待发送态用）。
 */
export function AppshotCard({ data, onRemove }: { data: AppshotCardData; onRemove?: () => void }): JSX.Element {
	const { t } = useTranslation("chat");
	const setFilePreview = useSetAtom(filePreviewAtom);
	const { imagePath, iconPath, appName, windowTitle, documentPath } = data;

	const label = documentPath
		? pathBasename(documentPath)
		: windowTitle
			? `${appName ? `${appName} · ` : ""}${windowTitle}`
			: appName || (imagePath ? pathBasename(imagePath) : "");

	const preview = (): void => {
		if (imagePath) setFilePreview({ name: pathBasename(imagePath), path: imagePath });
	};

	return (
		<div className="group/appshot relative flex w-fit flex-col items-center">
			<div
				className={imagePath ? "relative cursor-zoom-in" : "relative"}
				onClick={imagePath ? preview : undefined}
				onKeyDown={
					imagePath
						? (e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									preview();
								}
							}
						: undefined
				}
				role={imagePath ? "button" : undefined}
				tabIndex={imagePath ? 0 : undefined}
				title={imagePath ? t("inputBar.capsule.appshotPreview") : undefined}
			>
				<div className="h-20 w-24 overflow-hidden rounded-xl border border-border/70 bg-muted shadow-sm ring-1 ring-black/5 transition-shadow duration-200 group-hover/appshot:shadow-md dark:ring-white/10">
					{imagePath ? (
						<img
							src={mediaUrl(imagePath)}
							alt={t("inputBar.capsule.appshotThumbnailAlt")}
							className="h-full w-full object-cover transition-transform duration-200 group-hover/appshot:scale-[1.03]"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center">
							<span className="icon-[mdi--monitor-screenshot] h-6 w-6 text-muted-foreground" />
						</div>
					)}
				</div>
				{iconPath && (
					<div className="absolute bottom-0 left-1/2 h-8 w-8 -translate-x-1/2 translate-y-1/2 overflow-hidden rounded-[9px] bg-card shadow-md ring-2 ring-background">
						<img
							src={mediaUrl(iconPath)}
							alt={t("inputBar.capsule.appshotIconAlt")}
							className="h-full w-full object-cover"
						/>
					</div>
				)}
				{onRemove && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onRemove();
						}}
						className="absolute -top-2 -right-2 z-10 flex items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-md transition-all duration-150 group-hover/appshot:opacity-100 hover:scale-110 hover:text-destructive"
						title={t("inputBar.capsule.removeDefault")}
						style={{ height: 20, width: 20 }}
					>
						<span className="icon-[solar--close-circle-linear] h-3.5 w-3.5" />
					</button>
				)}
			</div>
			{label && (
				<span className="mt-4 max-w-[96px] truncate text-center text-[10px] text-muted-foreground leading-tight">
					{label}
				</span>
			)}
		</div>
	);
}
