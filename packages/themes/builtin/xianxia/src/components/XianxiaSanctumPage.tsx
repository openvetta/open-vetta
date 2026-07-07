import type { ThemePageProps } from "@vetta/theme-sdk";
import type { JSX } from "react";

export function XianxiaSanctumPage({ layout }: ThemePageProps): JSX.Element {
	return (
		<div className="xianxia-sanctum-page" data-theme-page-layout={layout}>
			<div className="xianxia-sanctum-orbit xianxia-sanctum-orbit-outer" />
			<div className="xianxia-sanctum-orbit xianxia-sanctum-orbit-inner" />
			<div className="xianxia-sanctum-core" />
			<div className="xianxia-sanctum-mist xianxia-sanctum-mist-left" />
			<div className="xianxia-sanctum-mist xianxia-sanctum-mist-right" />
		</div>
	);
}
