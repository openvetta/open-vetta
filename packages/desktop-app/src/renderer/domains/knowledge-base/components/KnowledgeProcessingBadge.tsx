import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * 顶栏标题右侧徽标：知识库后台加工（建立索引）进行中时显示，带 spin 动画。
 * 自订阅主进程加工状态，空闲时渲染 null。挂在 pageHeaderTitleBadgeAtom 插槽里，
 * 仅知识库页在 mount 时注入、unmount 时清除，其它页面不受影响。
 */
export function KnowledgeProcessingBadge(): JSX.Element | null {
	const { t } = useTranslation("settings");
	const [processing, setProcessing] = useState(false);

	useEffect(() => {
		let alive = true;
		void window.vetta.knowledge.isProcessing().then((v) => {
			if (alive) setProcessing(v);
		});
		const off = window.vetta.knowledge.onProcessingChanged((v) => setProcessing(v));
		return () => {
			alive = false;
			off();
		};
	}, []);

	if (!processing) return null;

	return (
		<span className="no-drag inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
			<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
			{t("kbIndexing")}
		</span>
	);
}
