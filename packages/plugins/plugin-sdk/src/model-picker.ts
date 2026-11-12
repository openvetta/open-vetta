import { createElement, type ReactElement } from "react";
import { requireBridge } from "./host-bridge.js";

// ─── Model picker (host-rendered) ───
//
// 插件里选模型用的就是宿主输入栏右下角那一个：数据（本地配置 + 登录后的远程目录）、
// 服务商分栏、收藏、搜索、模型详情、推理档位与主题定制全部由宿主提供并保持同步。
// 插件只给受控的 value / onChange，决定选中的 modelKey 写到哪。

/** 推理档位的受控值。提供后选择器出现「推理档位」一栏。 */
export interface PluginModelPickerReasoning {
	/** 当前档位；无效或缺省时按所选模型的默认档位显示。 */
	value: string | undefined;
	onChange(level: string): void;
}

export interface PluginModelPickerProps {
	/** 当前选中的 `provider/modelId`；null 表示未选。 */
	value: string | null;
	/** 选中回调。只有提供了 `emptyOption` 时才会收到 null。 */
	onChange(modelKey: string | null): void;
	/** 推理档位；不传就没有这一栏，选中模型后菜单立即关闭。 */
	reasoning?: PluginModelPickerReasoning;
	/** 列表顶部的空值项，如「跟随默认」；选中它回调 null。 */
	emptyOption?: { label: string };
	/** 未选中时触发器上的文案；缺省为宿主的「选择模型」。 */
	placeholder?: string;
	/** 打「默认」徽章的模型；缺省为用户在宿主里设置的默认模型。 */
	defaultModelKey?: string;
	/** 未选中时自动选上宿主默认模型（只回调一次 onChange）。 */
	autoSelectDefault?: boolean;
	disabled?: boolean;
	ariaLabel?: string;
	/**
	 * 触发器形态：`field`（默认）为表单里带边框的选择框；`inline` 为输入栏里的无边框小胶囊。
	 */
	variant?: "field" | "inline";
	/** 追加到触发器上的类名（尺寸、圆角等）。 */
	className?: string;
}

/**
 * 宿主模型选择器。与会话输入栏、知识库设置等处是同一个组件、同一份模型目录。
 *
 * 选出来的 modelKey 可直接交给 `ctx.ai.complete({ modelKey })`、
 * `ctx.official.sessions.create({ modelKey })` 等；能否真正调用仍由对应能力的权限决定。
 * 没有可选模型且未选中、也没有 `emptyOption` 时不渲染任何内容。
 */
export function ModelPicker(props: PluginModelPickerProps): ReactElement {
	return createElement(requireBridge().ModelPicker, props);
}
