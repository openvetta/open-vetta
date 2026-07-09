import { AppBackground, type AppBackgroundProps } from "@vetta/theme-ui";
import type { JSX } from "react";

export function XianxiaAppBackground({
	className,
	...props
}: AppBackgroundProps): JSX.Element {
	return <AppBackground className={className} {...props} />;
}
