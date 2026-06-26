import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { PetActionId } from "../../../../shared/pet-actions";
import { PetVideoDebugBorder } from "./PetDebugOverlay";
import { VideoResizeHandles } from "./VideoResizeHandles";

function MissingPetVideo(): JSX.Element {
	const { t } = useTranslation("pet");

	return (
		<div className="flex h-[148px] w-[148px] select-none items-center justify-center rounded-full border border-border/50 bg-popover/60 text-center text-[11px] font-medium leading-5 text-muted-foreground shadow-lg">
			{t("video.missingTitle")}
			<br />
			{t("video.missingSubtitle")}
		</div>
	);
}

export function PetVideoSurface({
	actionDescription,
	actionId,
	baseSize,
	debugFrame,
	hasNaturalSize,
	maxVideoSize,
	shouldShowVideo,
	videoRef,
	videoSize,
	videoSrc,
	onError,
	onLoadedMetadata,
	onVideoSizeChange,
}: {
	actionDescription: string | undefined;
	actionId: PetActionId | undefined;
	baseSize: number;
	debugFrame: boolean;
	hasNaturalSize: boolean;
	maxVideoSize: number;
	shouldShowVideo: boolean;
	videoRef: RefObject<HTMLDivElement | null>;
	videoSize: { width: number; height: number };
	videoSrc: string | undefined;
	onError: () => void;
	onLoadedMetadata: (size: { width: number; height: number }) => void;
	onVideoSizeChange: (size: number) => void;
}): JSX.Element {
	if (!shouldShowVideo) {
		return <MissingPetVideo />;
	}

	return (
		<div
			ref={videoRef}
			className="relative"
			style={{
				width: hasNaturalSize ? `${videoSize.width}px` : "100%",
				height: hasNaturalSize ? `${videoSize.height}px` : "100%",
			}}
		>
			<PetVideoDebugBorder debugFrame={debugFrame} />
			{debugFrame && actionId ? (
				<VideoResizeHandles
					actionId={actionId}
					baseSize={baseSize}
					onSizeChange={onVideoSizeChange}
					videoScale={1}
					windowSize={maxVideoSize}
				/>
			) : null}
			<video
				key={actionId}
				src={videoSrc}
				autoPlay
				loop
				muted
				playsInline
				draggable={false}
				title={actionDescription}
				onLoadedMetadata={(event) => {
					onLoadedMetadata({
						width: event.currentTarget.videoWidth,
						height: event.currentTarget.videoHeight,
					});
				}}
				onError={onError}
				className="pointer-events-none h-full w-full select-none object-contain"
			/>
		</div>
	);
}
