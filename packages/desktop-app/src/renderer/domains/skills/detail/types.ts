/**
 * 能力详情：声明式 JSON 文档（非官方可执行 UI）。
 * 渲染端只认白名单 section type；未知 type 跳过。
 *
 * `showcase` 使用宿主内置「呈现模板」丰富视觉（CSS 构图，非真实截图）。
 */

export type CapabilityDetailStatus = "available" | "setup_required" | "disabled" | "enabled" | "readonly";

export type CapabilityPrimaryActionKind = "add" | "enable" | "setup" | "update" | "none";

export type CapabilitySecondaryActionKind = "disable" | "remove" | "configure";

/**
 * 演示画布母题：决定 chat-over-canvas 背景假 UI 的样式。
 * 宿主实现，catalog 只选 id。
 */
export type ShowcaseCanvasMotif = "design" | "code" | "docs" | "generic";

/** 呈现模板 id（宿主白名单） */
export type ShowcaseTemplateId = "chat-over-canvas" | "chat-thread";

/** 解析后的 section（文案已解析为展示字符串） */
export type CapabilityDetailSection =
	| { type: "intro"; title?: string; body: string }
	| {
			type: "showcase";
			/** 参考图风格：左侧产品画布 mock + 右侧对话气泡 */
			template: "chat-over-canvas";
			userPrompt: string;
			assistantReply: string;
			canvas: ShowcaseCanvasMotif;
			/** 助手头像：已解析的图片 URL；无则用默认图标 */
			brandIconUrl?: string;
			brandName?: string;
	  }
	| {
			type: "showcase";
			/** 纯对话线程（无画布） */
			template: "chat-thread";
			userPrompt: string;
			assistantReply: string;
			brandIconUrl?: string;
			brandName?: string;
	  }
	| {
			type: "media";
			title?: string;
			kind: "image";
			src: string;
			alt?: string;
	  }
	| {
			type: "featureList";
			title?: string;
			items: string[];
	  }
	| {
			type: "scenarios";
			title?: string;
			items: Array<{ icon?: string; label: string }>;
	  }
	| {
			type: "permissions";
			title?: string;
			lead?: string;
			items: string[];
			/** 展示「查看详细权限」并触发宿主 setup/configure */
			showDetailLink?: boolean;
	  }
	| {
			type: "reviews";
			title?: string;
			score?: number;
			count?: number;
			quotes: string[];
	  };

/** 可序列化的详情文档（catalog / 未来服务端字段） */
export interface CapabilityDetailDoc {
	schemaVersion: 1;
	developer?: string;
	tags?: string[];
	sections: CapabilityDetailSection[];
}

export interface CapabilityDetailViewModel {
	id: string;
	title: string;
	summary: string;
	developer?: string;
	tags: string[];
	/** skill 用 SkillTypeIcon；connector 用 url */
	icon: { kind: "skill"; skillType: "skill" | "scene"; icon?: string } | { kind: "image"; url?: string };
	status: CapabilityDetailStatus;
	primaryAction: CapabilityPrimaryActionKind;
	secondaryActions: CapabilitySecondaryActionKind[];
	sections: CapabilityDetailSection[];
	/** 主 CTA 是否 busy */
	busy: boolean;
	/** 是否可点「查看详细权限」 */
	canOpenPermissionDetails: boolean;
}
