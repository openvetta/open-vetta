import type { ComponentPropsWithoutRef } from "react";

/**
 * 正文配图。用原生 img 而非 next/image：正文图片尺寸未知且宿主不止 Next 一个。
 * alt 缺省给空串，读屏器会跳过装饰图而不是念出文件名。
 */
export function MarkdownImage({ alt, ...rest }: ComponentPropsWithoutRef<"img">) {
	// biome-ignore lint/nursery/noImgElement: 共享包不依赖 Next，正文图片尺寸不可预知
	return <img alt={alt ?? ""} loading="lazy" decoding="async" {...rest} />;
}
