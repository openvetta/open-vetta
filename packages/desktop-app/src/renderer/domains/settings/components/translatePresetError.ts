import type { PresetError } from "@preload/api.js";
import type { TFunction } from "i18next";

/**
 * 把主进程回传的结构化错误翻成界面文案。
 *
 * 主进程拿不到界面语言,只给错误码 + 参数(见 main/models/presets/errors.ts);
 * `detail` 是不翻译的原始信息(如 `net::ERR_CONNECTION_CLOSED`),附在括号里方便排查与上报。
 */
export function translatePresetError(error: PresetError, t: TFunction<"settings">): string {
	const message = t(ERROR_KEYS[error.code], { ...error.params, defaultValue: t("presetErrorNetwork") });
	return error.detail ? `${message}（${error.detail}）` : message;
}

const ERROR_KEYS: Record<PresetError["code"], string> = {
	"unknown-provider": "presetErrorUnknownProvider",
	"missing-key": "presetErrorMissingKey",
	"http-status": "presetErrorHttpStatus",
	"empty-models": "presetErrorEmptyModels",
	timeout: "presetErrorTimeout",
	network: "presetErrorNetwork",
};
