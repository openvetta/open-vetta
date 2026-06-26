// 静态打包的 catalog 聚合（见 ADR-0031）。main 与 renderer 都顶层 import 本文件，
// 由各自 Vite bundle 把 JSON 内联——零运行时 fs、零 async、不闪。新增语言/ns =
// 在此加一条 import + 在 resources 里加一项。

import enChat from "./locales/en/chat.json";
import enCommon from "./locales/en/common.json";
import enMain from "./locales/en/main.json";
import enPet from "./locales/en/pet.json";
import enProject from "./locales/en/project.json";
import enSettings from "./locales/en/settings.json";
import zhChat from "./locales/zh/chat.json";
import zhCommon from "./locales/zh/common.json";
import zhMain from "./locales/zh/main.json";
import zhPet from "./locales/zh/pet.json";
import zhProject from "./locales/zh/project.json";
import zhSettings from "./locales/zh/settings.json";

export const resources = {
	zh: { common: zhCommon, main: zhMain, chat: zhChat, project: zhProject, pet: zhPet, settings: zhSettings },
	en: { common: enCommon, main: enMain, chat: enChat, project: enProject, pet: enPet, settings: enSettings },
} as const;

export * from "./config.js";
