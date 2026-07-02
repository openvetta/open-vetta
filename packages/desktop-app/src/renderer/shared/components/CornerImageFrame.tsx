import { memo, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@shared/lib/utils";

export interface CornerImageFrameCorner {
	readonly backgroundPosition: string;
	readonly id: string;
	readonly position: {
		readonly bottom?: string;
		readonly left?: string;
		readonly right?: string;
		readonly top?: string;
	};
}

export interface CornerImageFrameDecoration {
	readonly backgroundSize: string;
	readonly cornerHeight: string;
	readonly corners: readonly CornerImageFrameCorner[];
	readonly cornerWidth: string;
}

interface CornerImageFrameProps extends ComponentPropsWithoutRef<"div"> {
	children: ReactNode;
	contentClassName?: string;
	decoration?: CornerImageFrameDecoration;
	imageUrl?: string;
}

const CornerImageDecoration = memo(function CornerImageDecoration({
	decoration,
	imageUrl,
}: {
	decoration: CornerImageFrameDecoration;
	imageUrl: string;
}): JSX.Element {
	return (
		<>
			{decoration.corners.map((corner) => (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute"
					key={corner.id}
					style={{
						width: decoration.cornerWidth,
						height: decoration.cornerHeight,
						...corner.position,
						backgroundImage: `url("${imageUrl}")`,
						backgroundPosition: corner.backgroundPosition,
						backgroundRepeat: "no-repeat",
						backgroundSize: decoration.backgroundSize,
					}}
				/>
			))}
		</>
	);
});

export function CornerImageFrame({
	children,
	className,
	contentClassName,
	decoration,
	imageUrl,
	...props
}: CornerImageFrameProps): JSX.Element {
	return (
		<div
			className={cn("relative", className)}
			{...props}
		>
			{imageUrl && decoration
				? (
						<CornerImageDecoration
							decoration={decoration}
							imageUrl={imageUrl}
						/>
					)
				: null}
			<div className={cn("relative", contentClassName)}>{children}</div>
		</div>
	);
}
