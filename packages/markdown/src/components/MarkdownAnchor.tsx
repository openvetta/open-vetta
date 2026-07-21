import type { ComponentPropsWithoutRef } from "react";

/** 站外链接一律新标签打开，并切断 opener 引用。 */
export function MarkdownAnchor({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) {
	const isExternal = !!href && /^https?:\/\//i.test(href);
	return (
		<a
			href={href}
			{...rest}
			{...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
		>
			{children}
		</a>
	);
}
