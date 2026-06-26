// react-i18next 类型增强：基于 zh 资源给 t() / useTranslation 提供 key 自动补全与校验。
import "i18next";
import type chat from "@/shared/i18n/locales/zh/chat.json";
import type common from "@/shared/i18n/locales/zh/common.json";
import type main from "@/shared/i18n/locales/zh/main.json";
import type pet from "@/shared/i18n/locales/zh/pet.json";
import type project from "@/shared/i18n/locales/zh/project.json";

declare module "i18next" {
	interface CustomTypeOptions {
		defaultNS: "common";
		resources: {
			common: typeof common;
			main: typeof main;
			chat: typeof chat;
			project: typeof project;
			pet: typeof pet;
		};
	}
}
