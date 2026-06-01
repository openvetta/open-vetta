import { useCallback, useEffect, useState } from "react";
import { Slider } from "@shared/components/ui/slider";
import { SettingSection } from "./shared";

const MIN_IMAGES = 1;
const MAX_IMAGES = 10;

function clampImages(value: number): number {
	if (!Number.isFinite(value)) return 2;
	return Math.min(Math.max(Math.round(value), MIN_IMAGES), MAX_IMAGES);
}

export function ContextStrategySettings(): JSX.Element {
	const [maxRecentImages, setMaxRecentImages] = useState(2);

	useEffect(() => {
		void window.vetta.session.getMaxRecentImages().then((v) => setMaxRecentImages(clampImages(v)));
	}, []);

	// 拖拽中只更新本地 state（UI 实时跟手），不落盘。
	const handlePreview = useCallback((pos: number) => {
		setMaxRecentImages(clampImages(pos));
	}, []);

	// 松手 / 点击刻度时才持久化一次，避免拖拽过程中每格都写文件造成卡顿。
	const handleCommit = useCallback((pos: number) => {
		const value = clampImages(pos);
		setMaxRecentImages(value);
		void window.vetta.session.setMaxRecentImages(value);
	}, []);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">上下文策略</h1>

			<SettingSection title="图片">
				<div className="px-5 py-4">
					<div className="flex items-baseline justify-between gap-4">
						<div className="text-[13px] font-medium text-foreground">上下文保留图片数</div>
						<div className="shrink-0 text-[13px] font-semibold tabular-nums text-primary">
							{maxRecentImages} 张
						</div>
					</div>
					<p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
						上下文中最多保留最近几张图片，更早的图片会被替换为文字占位以节省显存 / token。算力较低的机器（如本地小显存 GPU）建议调低，否则多图并存容易撑爆显存；算力充足或使用云端模型时可适当调高以保留更多视觉上下文。
					</p>

					<div className="mt-7 px-2.5">
						<Slider
							value={[maxRecentImages]}
							min={MIN_IMAGES}
							max={MAX_IMAGES}
							step={1}
							onValueChange={(vals) => handlePreview(vals[0])}
							onValueCommit={(vals) => handleCommit(vals[0])}
							aria-label="上下文保留图片数"
						/>
						<div className="mt-3 flex w-full items-center justify-between gap-1 px-0.5 text-[11px] font-medium text-muted-foreground">
							{Array.from({ length: MAX_IMAGES }, (_, i) => {
								const pos = i + MIN_IMAGES;
								const isCurrent = pos === maxRecentImages;
								return (
									<button
										type="button"
										key={pos}
										onClick={() => handleCommit(pos)}
										aria-label={`保留 ${pos} 张`}
										className="flex w-0 cursor-pointer flex-col items-center gap-1.5 outline-none"
									>
										<span className="h-1 w-px bg-muted-foreground/50" />
										<span className={isCurrent ? "text-primary" : "transition-colors hover:text-foreground"}>
											{pos}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				</div>
			</SettingSection>
		</div>
	);
}
