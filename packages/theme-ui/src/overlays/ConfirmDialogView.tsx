import { Button } from "@vetta-org/ui";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type JSX, type RefObject, useRef } from "react";
import { ThemeSurface } from "../appearance/ThemeSurface";

export interface ConfirmDialogViewState {
	readonly cancelLabel?: string;
	readonly checkbox?: {
		readonly checked: boolean;
		readonly label: string;
	};
	readonly confirmLabel?: string;
	readonly message: string;
	readonly title: string;
	readonly variant?: "danger" | "default";
}

export interface ConfirmDialogViewLabels {
	readonly cancel: string;
	readonly confirm: string;
}

export interface ConfirmDialogViewProps {
	readonly labels: ConfirmDialogViewLabels;
	readonly onCancel: () => void;
	readonly onCheckboxCheckedChange: (checked: boolean) => void;
	readonly onConfirm: () => void;
	readonly overlayRef: RefObject<HTMLDivElement | null>;
	readonly state: ConfirmDialogViewState | null;
}

export function ConfirmDialogView({
	labels,
	onCancel,
	onCheckboxCheckedChange,
	onConfirm,
	overlayRef,
	state,
}: ConfirmDialogViewProps): JSX.Element {
	const cancelRef = useRef<HTMLButtonElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(null);
	return (
		<DialogPrimitive.Root
			open={state !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay ref={overlayRef} className="no-drag fixed inset-0 z-[100] bg-background/70" />
				<DialogPrimitive.Content
					role="alertdialog"
					className="no-drag fixed left-1/2 top-1/2 z-[100] w-[min(360px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover shadow-lg outline-none"
					onOpenAutoFocus={(event) => {
						previousFocusRef.current =
							document.activeElement instanceof HTMLElement ? document.activeElement : null;
						event.preventDefault();
						cancelRef.current?.focus();
					}}
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
					}}
				>
					{state && (
						<>
							<ThemeSurface slot="root.confirmDialog.panel" />
							<div className="relative z-10 p-5">
								<DialogPrimitive.Title className="text-[15px] font-semibold text-foreground">
									{state.title}
								</DialogPrimitive.Title>
								<DialogPrimitive.Description className="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap break-words text-[13px] text-muted-foreground">
									{state.message}
								</DialogPrimitive.Description>
								{state.checkbox && (
									<label className="mt-4 flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
										<input
											type="checkbox"
											checked={state.checkbox.checked}
											onChange={(event) => onCheckboxCheckedChange(event.currentTarget.checked)}
											className="h-3.5 w-3.5 accent-primary"
										/>
										<span>{state.checkbox.label}</span>
									</label>
								)}
								<div className="mt-5 flex justify-end gap-2">
									<Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onCancel}>
										{state.cancelLabel ?? labels.cancel}
									</Button>
									<Button
										type="button"
										variant={state.variant === "danger" ? "destructive" : "primary"}
										size="sm"
										onClick={onConfirm}
									>
										{state.confirmLabel ?? labels.confirm}
									</Button>
								</div>
							</div>
						</>
					)}
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
