import { useTranslation } from "react-i18next";
import type { ModelOption } from "./useModelOptions";

/** 单个倍率数字：整数原样，有小数最多两位并去掉末尾的 0（0.30 → "0.3"，1 → "1"）。 */
export function fmtMultiplier(n: number): string {
	return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** 展示模型倍率：单个倍率（输入倍率，锚 V4 Pro=1x），全 0 显示免费，无数据不渲染。用 common 命名空间。 */
export function MultiplierTag({ multiplier }: { multiplier: ModelOption["multiplier"] }): JSX.Element | null {
	const { t } = useTranslation("common");
	if (!multiplier) return null;
	const { input, output } = multiplier;
	const label =
		input === 0 && output === 0
			? t("modelSelect.free")
			: t("modelSelect.multiplier", { value: fmtMultiplier(input) });
	return <span className="shrink-0 text-muted-foreground text-[11px] tabular-nums">{label}</span>;
}
