import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

export function StageDialogContent({ artwork, children }: { artwork: ReactNode; children: ReactNode }) {
	return (
		<Dialog.Portal>
			<Dialog.Overlay
				data-slot="dialog-overlay"
				className="no-drag fixed inset-0 z-50 bg-background/80 backdrop-blur-md"
			/>
			<Dialog.Content data-slot="dialog-stage" className="no-drag fixed inset-0 z-50 overflow-y-auto outline-none">
				<Dialog.Close asChild>
					<button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 cursor-default" />
				</Dialog.Close>
				<div className="pointer-events-none relative flex min-h-full items-center justify-center px-8 py-10">
					<div className="flex max-w-full flex-wrap items-start justify-center gap-x-10 gap-y-6">
						<div className="pointer-events-auto min-w-0 max-w-full">{artwork}</div>
						<div className="pointer-events-auto flex w-[240px] max-w-full flex-col pt-1">{children}</div>
					</div>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	);
}
