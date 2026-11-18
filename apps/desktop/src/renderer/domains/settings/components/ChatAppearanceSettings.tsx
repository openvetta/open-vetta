import { CHAT_BACKGROUND_COMPONENTS, isChatBackgroundId } from "@shared/theme/chat-background";
import {
	isUserBubbleColor,
	isUserBubbleShape,
	isUserBubbleWeight,
	USER_BUBBLE_PALETTE,
	USER_BUBBLE_SHAPES,
	USER_BUBBLE_WEIGHTS,
	userBubbleAppearanceAtom,
} from "@shared/theme/user-bubble-appearance";
import type { UserBubbleColor } from "@shared/theme/user-bubble-appearance";
import { Message } from "@vetta-org/theme-ui/chat/MessageView";
import { MessageVisual } from "@vetta-org/theme-ui/chat/MessageVisualView";
import { MotionSelect, SettingRow, SettingSection } from "@vetta-org/theme-ui/settings";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import type { AppearanceSettingsModel } from "./useAppearanceSettingsModel";

const section = SETTINGS_SECTION["appearance-chat-background"];
const colors = Object.keys(USER_BUBBLE_PALETTE) as UserBubbleColor[];

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
				<MotionSelect
					aria-label={colorLabel}
					value={appearance.color}
					options={colors.map((value) => ({
						value,
						label: (
							<span className="flex items-center gap-2">
								<span
									aria-hidden="true"
									className="size-3 shrink-0 rounded-full border border-border bg-secondary"
									style={{ backgroundColor: USER_BUBBLE_PALETTE[value]?.background }}
								/>
								{t(`userBubbleColors.${value}`)}
							</span>
						),
					}))}
					onValueChange={(color) => {
						if (isUserBubbleColor(color)) updateAppearance({ color });
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
