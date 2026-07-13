import { cn } from "@vetta/ui";
import type { JSX } from "react";
import { sanctumPageAssets } from "./assets";
import { formatCultivationNumber } from "./cultivationView";

function getCultivationNumberGlyphs(value: number): readonly string[] {
	return formatCultivationNumber(value).split("");
}

export function XianxiaCultivationNumber({
	className,
	digitClassName,
	prefix,
	value,
}: {
	readonly className?: string;
	readonly digitClassName: string;
	readonly prefix?: string;
	readonly value: number;
}): JSX.Element {
	return (
		<span className={cn("inline-flex items-end", className)}>
			{prefix && <span className="mr-1 font-semibold leading-none text-amber-50">{prefix}</span>}
			{getCultivationNumberGlyphs(value).map((glyph, index) =>
				glyph === "," ? (
					<span
						aria-hidden="true"
						className="mx-0.5 translate-y-[-0.06em] font-semibold leading-none text-amber-50"
						key={`${glyph}-${index}`}
					>
						,
					</span>
				) : (
					<img
						alt={glyph}
						className={cn("w-auto max-w-none object-contain", digitClassName)}
						key={`${glyph}-${index}`}
						src={sanctumPageAssets.cultivationDigits[Number(glyph)]}
					/>
				),
			)}
		</span>
	);
}
