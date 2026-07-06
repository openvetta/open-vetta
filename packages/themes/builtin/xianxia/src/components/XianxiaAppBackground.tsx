import { AppBackground, type AppBackgroundProps } from "@vetta/theme-ui";
import type { JSX } from "react";
import { xianxiaAssets } from "../assets";

export function XianxiaAppBackground({
	className,
	...props
}: AppBackgroundProps): JSX.Element {
	return (
		<AppBackground className={className} {...props}>
			<img
				alt=""
				aria-hidden="true"
				className="xianxia-frame-glow-silver absolute right-[2%] top-[3%] z-10 w-[clamp(280px,38vw,640px)] object-contain"
				src={xianxiaAssets.whiteGlazeImmortal}
			/>
			<img
				alt=""
				aria-hidden="true"
				className="xianxia-frame-glow-gold-strong absolute right-[1%] top-[15%] z-20 w-[clamp(90px,12vw,180px)] object-contain"
				src={xianxiaAssets.whiteGlazeGourd}
			/>
		</AppBackground>
	);
}
