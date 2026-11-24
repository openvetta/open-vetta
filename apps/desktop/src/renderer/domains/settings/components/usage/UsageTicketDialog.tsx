import { Button } from "@shared/components/ui/button";
import { showToast } from "@shared/store/toast-atoms";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, useState } from "react";
import { POSTER_WIDTH, renderTicketPng, ticketLayout, UsageTicket, type UsageTicketModel } from "./UsageTicket";

/** Pixel ratio of the saved PNG; the caption under the button quotes the resulting size. */
const EXPORT_SCALE = 2;

export interface UsageTicketDialogLabels {
	open: string;
	eyebrow: string;
	title: string;
	description: string;
	period: string;
	image: string;
	make: string;
	copy: string;
	close: string;
	copied: string;
	saved: string;
	failed: string;
}

/**
 * Ticket maker as a stage rather than a form: the poster stands on the blurred backdrop on the
 * left, and a short caption column floats beside it, top-aligned with the poster.
 */
export function UsageTicketDialog({
	ticket,
	rangeLabel,
	labels,
}: {
	ticket: UsageTicketModel;
	rangeLabel: string;
	labels: UsageTicketDialogLabels;
}): JSX.Element {
	const svgRef = useRef<SVGSVGElement>(null);
	const [busy, setBusy] = useState(false);
	const posterHeight = ticketLayout(ticket.models.rows.length).posterHeight;

	const exportImage = async (action: (dataUrl: string) => Promise<void> | void, done: string) => {
		const svg = svgRef.current;
		if (!svg || busy) return;
		setBusy(true);
		try {
			await action(await renderTicketPng(svg, EXPORT_SCALE));
			showToast({ variant: "success", message: done });
		} catch {
			showToast({ variant: "error", message: labels.failed });
		} finally {
			setBusy(false);
		}
	};
	const save = () =>
		exportImage((dataUrl) => {
			const link = document.createElement("a");
			link.href = dataUrl;
			link.download = ticket.fileName;
			link.click();
		}, labels.saved);
	const copy = () => exportImage((dataUrl) => window.vetta.clipboard.writeImage(dataUrl), labels.copied);

	return (
		<DialogPrimitive.Root>
			<DialogPrimitive.Trigger asChild>
				<Button variant="ghost" size="sm">
					<span className="icon-[solar--ticket-linear] h-3.5 w-3.5" />
					{labels.open}
				</Button>
			</DialogPrimitive.Trigger>
			<DialogPrimitive.Portal>
				<DialogPrimitive.Overlay
					data-slot="dialog-overlay"
					className="no-drag fixed inset-0 z-50 bg-background/80 backdrop-blur-md"
				/>
				<DialogPrimitive.Content
					data-slot="dialog-stage"
					onOpenAutoFocus={(event) => event.preventDefault()}
					className="no-drag fixed inset-0 z-50 overflow-y-auto outline-none"
				>
					{/* Clicking the empty stage closes, like clicking the overlay. */}
					<DialogPrimitive.Close asChild>
						<button type="button" tabIndex={-1} aria-hidden="true" className="fixed inset-0 cursor-default" />
					</DialogPrimitive.Close>
					<div className="pointer-events-none relative flex min-h-full items-center justify-center px-8 py-10">
						<div className="pointer-events-auto flex flex-wrap items-start justify-center gap-x-10 gap-y-6">
							<div
								className="w-[min(420px,calc(100vw-64px))] overflow-hidden rounded-2xl"
								style={{ aspectRatio: `${POSTER_WIDTH} / ${posterHeight}` }}
							>
								<UsageTicket ref={svgRef} ticket={ticket} />
							</div>

							<div className="flex w-[240px] flex-col pt-1">
								<div className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
									{labels.eyebrow}
								</div>
								<DialogPrimitive.Title className="mt-2 text-[20px] font-semibold text-foreground">
									{labels.title}
								</DialogPrimitive.Title>
								<DialogPrimitive.Description className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
									{labels.description}
								</DialogPrimitive.Description>

								<dl className="mt-6 flex flex-col gap-2.5 text-[12px]">
									<div className="flex items-baseline justify-between gap-3">
										<dt className="text-muted-foreground">{labels.period}</dt>
										<dd className="truncate font-medium tabular-nums text-foreground">{rangeLabel}</dd>
									</div>
									<div className="flex items-baseline justify-between gap-3">
										<dt className="text-muted-foreground">{labels.image}</dt>
										<dd className="font-medium tabular-nums text-foreground">
											{POSTER_WIDTH * EXPORT_SCALE} × {posterHeight * EXPORT_SCALE} PNG
										</dd>
									</div>
								</dl>

								<Button
									variant="primary"
									className="mt-7 w-full"
									disabled={busy}
									onClick={() => void save()}
								>
									<span className="icon-[solar--download-minimalistic-linear] h-4 w-4" />
									{labels.make}
								</Button>
								<div className="mt-2 flex items-center justify-between">
									<Button variant="ghost" size="sm" disabled={busy} onClick={() => void copy()}>
										<span className="icon-[solar--copy-linear] h-3.5 w-3.5" />
										{labels.copy}
									</Button>
									<DialogPrimitive.Close asChild>
										<Button variant="ghost" size="sm">
											{labels.close}
										</Button>
									</DialogPrimitive.Close>
								</div>
							</div>
						</div>
					</div>
				</DialogPrimitive.Content>
			</DialogPrimitive.Portal>
		</DialogPrimitive.Root>
	);
}
