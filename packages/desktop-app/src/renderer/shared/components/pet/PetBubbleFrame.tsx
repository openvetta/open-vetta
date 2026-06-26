import type { CSSProperties, ReactNode } from "react";
import { getPetBubbleStyle, type PetBubbleStyleId } from "../../../../shared/pet-bubbles";

export function PetBubbleFrame({
	children,
	decorUrl,
	styleId,
}: {
	children: ReactNode;
	decorUrl: string | undefined;
	styleId: PetBubbleStyleId;
}): JSX.Element {
	const bubbleStyle = getPetBubbleStyle(styleId);
	const decor = bubbleStyle.decor;
	const surfaceStyle = bubbleStyle.surface.style as CSSProperties | undefined;

	return (
		<div
			className={bubbleStyle.surface.bodyClassName}
			style={surfaceStyle}
		>
			{decorUrl && decor
				? decor.corners.map((item) => (
						<span
							aria-hidden="true"
							className="absolute"
							key={item.id}
							style={{
								width: decor.cornerWidth,
								height: decor.cornerHeight,
								...item.position,
								backgroundImage: `url("${decorUrl}")`,
								backgroundPosition: item.backgroundPosition,
								backgroundRepeat: "no-repeat",
								backgroundSize: decor.backgroundSize,
							}}
						/>
					))
				: null}
			<div className={bubbleStyle.surface.textClassName}>{children}</div>
		</div>
	);
}
