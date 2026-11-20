import { CHAT_BACKGROUND_COMPONENTS, isChatBackgroundId } from "@shared/theme/chat-background";
import {
	isUserBubbleColor,
	isUserBubbleColorChoice,
	isUserBubbleShape,
	isUserBubbleWeight,
	USER_BUBBLE_PALETTE,
	USER_BUBBLE_SHAPES,
	USER_BUBBLE_WEIGHTS,
	userBubbleAppearanceAtom,
} from "@shared/theme/user-bubble-appearance";
import type { UserBubbleColor } from "@shared/theme/user-bubble-appearance";
import { ColorSwatchPicker } from "@vetta-org/ui";
import { Message } from "@vetta-org/theme-ui/chat/MessageView";
import { MessageVisual } from "@vetta-org/theme-ui/chat/MessageVisualView";
import { MotionSelect, SettingRow, SettingSection } from "@vetta-org/theme-ui/settings";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import type { AppearanceSettingsModel } from "./useAppearanceSettingsModel";

const section = SETTINGS_SECTION["appearance-chat-background"];
const paletteColorKeys = (Object.keys(USER_BUBBLE_PALETTE) as UserBubbleColor[]).filter((key) => key !== "default");

/** 色点回传的是颜色值，要认出它对应哪个命名预设（命中就存 key，不命中才是自选色）。 */
function paletteKeyOf(hex: string): UserBubbleColor | null {
	const target = hex.toLowerCase();
	const hit = paletteColorKeys.find((key) => USER_BUBBLE_PALETTE[key]?.background.toLowerCase() === target);
	return hit ?? null;
}

type ChatAppearanceProps = Pick<AppearanceSettingsModel, "chatBackgroundId" | "chatBackgroundOptions"> & {
	onBackgroundChange: AppearanceSettingsModel["actions"]["setChatBackground"];
};

export function ChatAppearanceSettings({ chatBackgroundId, chatBackgroundOptions, onBackgroundChange }: ChatAppearanceProps): JSX.Element {
	const { t } = useTranslation("settings");
	const [appearance, updateAppearance] = useAtom(userBubbleAppearanceAtom);
	const backgroundLabel = t("chatAppearanceBackground");
	const shapeLabel = t("userBubbleShape");
	const colorLabel = t("userBubbleColor");
	const weightLabel = t("userBubbleWeight");
	const Backdrop = CHAT_BACKGROUND_COMPONENTS[chatBackgroundId];

	// 命名预设与 default（跟随主题）分开：default 不是一个颜色，交给 defaultOption 表达。
	const colorValue = isUserBubbleColor(appearance.color)
		? appearance.color === "default"
			? null
			: (USER_BUBBLE_PALETTE[appearance.color]?.background ?? null)
		: appearance.color;

	return (
		<SettingSection section={section} title={t(section.titleKey)}>
			<div className="relative isolate flex min-h-36 items-center justify-end overflow-hidden border-b border-border bg-background px-5 py-6">
				{Backdrop ? (
					<>
						<Backdrop fade="none" />
						<div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-background/60" />
					</>
				) : null}
				<div className="relative min-w-0 max-w-full">
					<Message.Root>
						<MessageVisual.OutgoingBubble>{t("userBubblePreview")}</MessageVisual.OutgoingBubble>
					</Message.Root>
				</div>
			</div>
			<SettingRow title={backgroundLabel}>
				<MotionSelect
					aria-label={backgroundLabel}
					value={chatBackgroundId}
					options={chatBackgroundOptions.map(({ id, label, hint }) => ({ value: id, label, title: hint }))}
					onValueChange={(background) => {
						if (isChatBackgroundId(background)) onBackgroundChange(background);
					}}
				/>
			</SettingRow>
			<SettingRow title={shapeLabel}>
				<MotionSelect
					aria-label={shapeLabel}
					value={appearance.shape}
					options={USER_BUBBLE_SHAPES.map((value) => ({ value, label: t(`userBubbleShapes.${value}`) }))}
					onValueChange={(shape) => {
						if (isUserBubbleShape(shape)) updateAppearance({ shape });
					}}
				/>
			</SettingRow>
			<SettingRow title={colorLabel}>
				<ColorSwatchPicker
					showLabel={false}
					labels={{
						title: "",
						group: colorLabel,
						custom: t("userBubbleColorCustom"),
						valueInput: t("userBubbleColorValueInput"),
						invalid: t("userBubbleColorInvalid"),
						hue: t("userBubbleColorHue"),
						area: t("userBubbleColorArea"),
						eyedropper: t("userBubbleColorEyedropper"),
					}}
					defaultOption={{ label: t("userBubbleColors.default") }}
					allowCustom
					size="sm"
					options={paletteColorKeys.map((key) => ({
						value: USER_BUBBLE_PALETTE[key]?.background ?? "#000000",
						label: t(`userBubbleColors.${key}`),
					}))}
					value={colorValue}
					onChange={(next) => {
						if (next === null) {
							updateAppearance({ color: "default" });
							return;
						}
						const key = paletteKeyOf(next);
						if (key) updateAppearance({ color: key });
						else if (isUserBubbleColorChoice(next)) updateAppearance({ color: next });
					}}
				/>
			</SettingRow>
			<SettingRow title={weightLabel} border={false}>
				<MotionSelect
					aria-label={weightLabel}
					value={appearance.weight}
					options={USER_BUBBLE_WEIGHTS.map((value) => ({ value, label: t(`userBubbleWeights.${value}`) }))}
					onValueChange={(weight) => {
						if (isUserBubbleWeight(weight)) updateAppearance({ weight });
					}}
				/>
			</SettingRow>
		</SettingSection>
	);
}
