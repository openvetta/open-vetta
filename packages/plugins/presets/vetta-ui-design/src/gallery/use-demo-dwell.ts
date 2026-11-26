import { useEffect, useState } from "react";

/**
 * 悬停多久才挂 demo。滚动时光标底下的卡片一直在换，没有这段停留，每掠过一张就
 * 建一个 1280px 宽的 iframe 并解析一份完整文档，正好落在滚动那几帧里。
 */
const DEMO_DWELL_MS = 160;

export interface DemoDwellHandlers {
	onMouseEnter(): void;
	onMouseLeave(): void;
	onFocus(): void;
	onBlur(): void;
}

/**
 * 风格卡宫格的 iframe 预算：静止时一张 demo 都不挂，悬停（或键盘聚焦）停留够久的那一张
 * 才挂，移开即卸。画廊风格墙与设计资源 Dialog 共用——几十张卡连排，每张进视口就挂
 * iframe 时滚动必卡。
 */
export function useDemoDwell(): { demoId: string | null; handlersFor(id: string): DemoDwellHandlers } {
	/** 悬停中的条目。 */
	const [hovered, setHovered] = useState<string | null>(null);
	/** 悬停停留够久、真的值得付 iframe 代价的那一张。 */
	const [demoId, setDemoId] = useState<string | null>(null);

	useEffect(() => {
		if (hovered === null) {
			setDemoId(null);
			return;
		}
		const timer = setTimeout(() => setDemoId(hovered), DEMO_DWELL_MS);
		return () => clearTimeout(timer);
	}, [hovered]);

	const handlersFor = (id: string): DemoDwellHandlers => {
		const enter = (): void => setHovered(id);
		const leave = (): void => setHovered((current) => (current === id ? null : current));
		return { onMouseEnter: enter, onMouseLeave: leave, onFocus: enter, onBlur: leave };
	};

	return { demoId, handlersFor };
}
