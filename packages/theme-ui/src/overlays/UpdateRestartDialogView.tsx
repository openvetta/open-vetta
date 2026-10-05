import { Button } from "@vetta-org/ui";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type JSX, type RefObject, useRef } from "react";
import { ThemeSurface } from "../appearance/ThemeSurface";

export interface UpdateRestartDialogViewLabels {
	readonly install: string;
	readonly later: string;
	readonly message: string;
	readonly title: string;
}

export interface UpdateRestartDialogViewProps {
	readonly labels: UpdateRestartDialogViewLabels;
	readonly onClose: () => void;
	readonly onInstall: () => void;
	readonly overlayRef: RefObject<HTMLDivElement | null>;
	readonly releaseNote?: string;
	readonly visible: boolean;
}

export function UpdateRestartDialogView({
	labels,
	onClose,
	onInstall,
	overlayRef,
	releaseNote,
	visible,
}: UpdateRestartDialogViewProps): JSX.Element {
	const laterRef = useRef<HTMLButtonElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);
	return (
		<DialogPrimitive.Root
			open={visible}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay ref={overlayRef} className="no-drag fixed inset-0 z-[100] bg-background/70" />
				<DialogPrimitive.Content
					className="no-drag fixed left-1/2 top-1/2 z-[100] w-[min(420px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover shadow-lg outline-none"
					onOpenAutoFocus={(event) => {
						previousFocusRef.current =
							document.activeElement instanceof HTMLElement ? document.activeElement : null;
						event.preventDefault();
						laterRef.current?.focus();
					}}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
					}}
				>
					<ThemeSurface slot="root.updateRestartDialog.panel" />
					<div className="relative z-10 p-5">
						<div className="flex items-center gap-2">
							<span aria-hidden="true" className="icon-[solar--download-square-linear] h-5 w-5 text-primary" />
							<DialogPrimitive.Title className="text-[15px] font-semibold text-foreground">
								{labels.title}
							</DialogPrimitive.Title>
						</div>
						<DialogPrimitive.Description className="mt-2 text-[12px] text-muted-foreground">
							{labels.message}
						</DialogPrimitive.Description>
						{releaseNote && (
							<div className="mt-3 max-h-[40vh] overflow-auto rounded-lg border border-border bg-secondary/50 p-3">
								<p className="whitespace-pre-wrap break-words text-[12px] text-muted-foreground">
									{releaseNote}
								</p>
							</div>
						)}
						<div className="mt-5 flex justify-end gap-2">
							<Button ref={laterRef} type="button" variant="ghost" size="sm" onClick={onClose}>
								{labels.later}
							</Button>
							<Button type="button" variant="primary" size="sm" onClick={onInstall}>
								{labels.install}
							</Button>
						</div>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
