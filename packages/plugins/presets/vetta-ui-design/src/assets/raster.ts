/**
 * 下载下来的图按画框里的显示尺寸裁切、压缩后再进 assets/。
 *
 * 原图动辄几 MB（Commons 的原图 4MB、NASA 的 ~orig 更大），整张塞进设计包会让版本
 * 历史和 .vetdz 一起膨胀，frame 加载也慢。按显示尺寸的两倍出图，清晰度足够，体积
 * 通常在几百 KB 以内。
 */

export interface Size {
	width: number;
	height: number;
}

export interface CoverPlan {
	sx: number;
	sy: number;
	sw: number;
	sh: number;
	width: number;
	height: number;
}

/** 输出图最长边上限：再大对设计稿没有意义，只会增加体积。 */
export const MAX_EDGE = 2400;
/** 按显示尺寸的几倍出图（高分屏截图与导出）。 */
export const PIXEL_RATIO = 2;

/**
 * object-fit: cover 的裁切：从原图中间取出与目标同比例的最大区域，再缩到目标尺寸的
 * 两倍（不放大原图、不超过最长边上限）。
 */
export function planCover(source: Size, target: Size): CoverPlan {
	const targetRatio = target.width / target.height;
	const sourceRatio = source.width / source.height;
	const sw = sourceRatio > targetRatio ? source.height * targetRatio : source.width;
	const sh = sourceRatio > targetRatio ? source.height : source.width / targetRatio;
	const wanted = Math.min(target.width * PIXEL_RATIO, sw, MAX_EDGE * Math.min(1, targetRatio));
	const width = Math.max(1, Math.round(Math.min(wanted, MAX_EDGE)));
	const height = Math.max(1, Math.round(width / targetRatio));
	return { sx: Math.round((source.width - sw) / 2), sy: Math.round((source.height - sh) / 2), sw, sh, width, height };
}

/** 渲染进程里才有 canvas；测试环境或宿主不支持时返回 null，调用方原样保存。 */
export async function coverImage(dataUrl: string, target: Size, quality = 0.82): Promise<{ base64: string } & Size | null> {
	if (typeof document === "undefined" || typeof Image === "undefined") return null;
	const image = await new Promise<HTMLImageElement | null>((resolve) => {
		const element = new Image();
		element.onload = () => resolve(element);
		element.onerror = () => resolve(null);
		element.src = dataUrl;
	});
	if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) return null;
	const plan = planCover({ width: image.naturalWidth, height: image.naturalHeight }, target);
	const canvas = document.createElement("canvas");
	canvas.width = plan.width;
	canvas.height = plan.height;
	const context = canvas.getContext("2d");
	if (!context) return null;
	context.imageSmoothingQuality = "high";
	context.drawImage(image, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.width, plan.height);
	try {
		const out = canvas.toDataURL("image/jpeg", quality);
		return { base64: out.slice(out.indexOf(",") + 1), width: plan.width, height: plan.height };
	} catch {
		return null;
	}
}
