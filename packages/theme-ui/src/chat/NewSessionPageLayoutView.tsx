import type { JSX, ReactNode } from "react";

export interface NewSessionPageLayoutViewProps {
	readonly background: ReactNode;
	readonly dropZone: (children: ReactNode) => ReactNode;
	readonly guidingWords?: ReactNode;
	readonly hero?: ReactNode;
	readonly inputBar: ReactNode;
	readonly isShort: boolean;
	readonly skillBadges?: ReactNode;
	readonly themedBackground?: ReactNode;
}

export function NewSessionPageLayoutView({
	background,
	dropZone,
	guidingWords,
	hero,
	inputBar,
	isShort,
	skillBadges,
	themedBackground,
}: NewSessionPageLayoutViewProps): JSX.Element {
	return (
		<>
			{dropZone(
				<>
					{background}
					{themedBackground}
					<div className="no-drag relative z-[1] flex flex-1 flex-col overflow-y-auto">
						<div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-6">
							{hero}
							{skillBadges && (
								<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">{skillBadges}</div>
							)}
							<div className="w-full">{inputBar}</div>
							{!isShort && guidingWords && (
								<div className="mx-auto w-full max-w-2xl px-2 sm:px-4">{guidingWords}</div>
							)}
						</div>
					</div>
				</>,
			)}
		</>
	);
}
