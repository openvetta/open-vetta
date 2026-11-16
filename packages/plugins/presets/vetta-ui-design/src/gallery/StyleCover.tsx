import { useEffect, useRef, useState } from "react";
import { DesignSystemPreview } from "../canvas/DesignSystemPreview";
import type { DesignSystem } from "../design-systems/types";
import { cachedStyleCover, loadStyleCover, styleCoverUrl } from "./style-cover";

/**
 * 风格卡的静态预览：有封面用封面，没有（或还没取到、取失败）就是 token 色板。
 *
 * 底层永远铺着色板，封面图加载完才淡入盖上去——取图期间、封面缺失、请求失败，用户看到的
 * 都是一块有信息量的色板，而不是空白或裂图。封面只在卡片进入视口（留 400px 余量）后才取，
 * 风格墙一次不会为屏幕外的几十张卡发请求。
 */
export function StyleCover({ system }: { system: DesignSystem }) {
	const url = styleCoverUrl(system);
	const boxRef = useRef<HTMLDivElement | null>(null);
	const [src, setSrc] = useState<string | null>(() => (url ? cachedStyleCover(url) : null));
	/** 图片真的解码完成才淡入，避免在解码期间露出半截图。 */
	const [shown, setShown] = useState(false);

	useEffect(() => {
		setSrc(url ? cachedStyleCover(url) : null);
		setShown(false);
		const box = boxRef.current;
		if (!url || !box || cachedStyleCover(url)) return;
		let cancelled = false;
		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return;
				observer.disconnect();
				void loadStyleCover(url).then((dataUrl) => {
					if (!cancelled && dataUrl) setSrc(dataUrl);
				});
			},
			{ rootMargin: "400px" },
		);
		observer.observe(box);
		return () => {
			cancelled = true;
			observer.disconnect();
		};
	}, [url]);

	return (
		// absolute inset-0：由调用方的相对定位容器决定尺寸，不依赖百分比高度（flex 子项里不可靠）。
		<div ref={boxRef} className="absolute inset-0 overflow-hidden">
			<DesignSystemPreview system={system} className="absolute inset-0" />
			{src ? (
				<img
					src={src}
					alt=""
					draggable={false}
					decoding="async"
					onLoad={() => setShown(true)}
					className="absolute inset-0 h-full w-full select-none object-cover object-top transition-opacity duration-300"
					style={{ opacity: shown ? 1 : 0 }}
				/>
			) : null}
		</div>
	);
}
