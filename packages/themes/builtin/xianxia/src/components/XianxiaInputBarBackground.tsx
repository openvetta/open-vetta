import {
	InputBarBackground,
	type InputBarBackgroundProps,
} from "@vetta/theme-ui";
import type { JSX } from "react";
import { xianxiaAssets } from "../assets";

export function XianxiaInputBarBackground({
	className,
	...props
}: InputBarBackgroundProps): JSX.Element {
	return (
		<InputBarBackground
			className={["z-[3]", className].filter(Boolean).join(" ")}
			{...props}
		>
			<img
				alt=""
				aria-hidden="true"
				className="absolute -right-3 -bottom-10 h-[145%] w-auto max-w-[48%] object-contain object-right-bottom"
				src={xianxiaAssets.inputBarBackground}
			/>
		</InputBarBackground>
	);
}
