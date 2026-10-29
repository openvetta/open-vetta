import { useTranslation } from "@vetta-org/plugin-sdk";
import { type CSSProperties, forwardRef } from "react";

interface NotesVisibilitySwitchProps {
	visible: boolean;
	onToggle(): void;
	/** 左邻的备注工具是否处于选中态；决定整颗胶囊的底色。 */
	joinedActive: boolean;
	/** 跟随备注工具的放大倍数，保证两半一起动。 */
	scale: number;
	transition: string;
	style?: CSSProperties;
}

/**
 * 底部工具栏里紧挨备注工具的「显示/隐藏备注」开关。做成真开关（而不是又一个按下态图标按钮）：
 * 它控制的是画布上一整层内容在不在，开合状态必须一眼可读，不能只靠底色深浅。
 * 隐藏只有这一个入口（自动规则一律只往显示推）。
 */
export const NotesVisibilitySwitch = forwardRef<HTMLButtonElement, NotesVisibilitySwitchProps>(
	function NotesVisibilitySwitch({ visible, onToggle, joinedActive, scale, transition, style }, ref) {
		const { t } = useTranslation();
		const label = t(visible ? "notes.visibility.hide" : "notes.visibility.show");
		return (
			<button
				ref={ref}
				type="button"
				role="switch"
				aria-checked={visible}
				title={label}
				aria-label={label}
				onClick={onToggle}
				className={`relative flex h-[34px] shrink-0 origin-bottom items-center rounded-l-none rounded-r-full pr-2.5 pl-1 outline-none will-change-transform focus-visible:ring-2 focus-visible:ring-ring/40 ${
					joinedActive ? "bg-primary text-primary-foreground" : "bg-muted/55 text-primary hover:bg-muted"
				}`}
				style={{ ...style, transform: `scale(${scale})`, transition }}
			>
				<span
					className="relative block h-[14px] w-6 rounded-full transition-colors"
					style={{ background: visible ? "currentColor" : "color-mix(in oklab, var(--muted-foreground) 35%, transparent)" }}
					aria-hidden
				>
					<span
						className={`absolute top-[2px] left-[2px] block size-[10px] rounded-full transition-transform ${joinedActive ? "bg-primary" : "bg-background"}`}
						style={{ transform: visible ? "translateX(10px)" : "translateX(0)" }}
					/>
				</span>
			</button>
		);
	},
);
