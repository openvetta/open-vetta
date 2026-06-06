import type { ReactNode } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../components/ui/dialog";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "../components/ui/drawer";

interface ActionApprovalSurfaceProps {
	title: string;
	description: string;
	children: ReactNode;
	footer: ReactNode;
}

export function ActionApprovalFrame({
	editable,
	children,
}: {
	editable: boolean;
	children: ReactNode;
}): JSX.Element {
	if (editable) {
		return (
			<Drawer open direction="right" dismissible={false}>
				<DrawerContent className="w-[min(560px,calc(100vw-2rem))] sm:max-w-[560px]">
					<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-auto sm:max-w-[560px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				{children}
			</DialogContent>
		</Dialog>
	);
}

export function ActionApprovalDialog({
	title,
	description,
	children,
	footer,
}: ActionApprovalSurfaceProps): JSX.Element {
	return (
		<Dialog open>
			<DialogContent
				className="max-h-[90vh] overflow-hidden sm:max-w-[520px]"
				showCloseButton={false}
				onInteractOutside={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 overflow-y-auto">{children}</div>
				<DialogFooter>{footer}</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ActionApprovalDrawer({
	title,
	description,
	children,
	footer,
}: ActionApprovalSurfaceProps): JSX.Element {
	return (
		<Drawer open direction="right" dismissible={false}>
			<DrawerContent className="w-[min(520px,calc(100vw-2rem))] sm:max-w-[520px]">
				<DrawerHeader className="border-b border-border/60">
					<DrawerTitle>{title}</DrawerTitle>
					<DrawerDescription>{description}</DrawerDescription>
				</DrawerHeader>
				<div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
				<DrawerFooter className="border-t border-border/60">{footer}</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
