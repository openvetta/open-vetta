import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@vetta/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildCapabilityDetailViewModel } from "../../detail/build-capability-detail";
import type { CapabilitiesModel, CapabilityItem } from "../../hooks/useCapabilitiesModel";
import { CapabilityDetailShell } from "./CapabilityDetailShell";

export function CapabilityDetailDrawer({
	item,
	model,
	onClose,
}: {
	item: CapabilityItem | null;
	model: CapabilitiesModel;
	onClose: () => void;
}): JSX.Element {
	const { t } = useTranslation("skills");

	const view = useMemo(() => (item ? buildCapabilityDetailViewModel(item, t) : null), [item, t]);

	return (
		<Drawer
			direction="right"
			open={item !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			{/*
			  Drawer 基座对 right 方向写死了 data-[vaul-drawer-direction=right]:sm:max-w-sm，
			  普通 sm:max-w-* 选择器更弱盖不掉，必须用同 data 前缀覆盖。
			*/}
			<DrawerContent className="flex h-full max-h-screen w-[min(36rem,calc(100vw-1.5rem))] flex-col border-l-0 data-[vaul-drawer-direction=right]:w-[min(36rem,calc(100vw-1.5rem))] data-[vaul-drawer-direction=right]:sm:max-w-xl">
				{item && view ? (
					<>
						<DrawerHeader className="sr-only">
							<DrawerTitle>{view.title}</DrawerTitle>
							<DrawerDescription>{view.summary}</DrawerDescription>
						</DrawerHeader>
						<CapabilityDetailShell
							view={view}
							onPrimary={() => model.runPrimaryAction(item)}
							onSecondary={(kind) => model.runSecondaryAction(item, kind)}
							onOpenPermissionDetails={() => {
								if (item.driver === "connector") {
									if (item.setupRequired) model.setup(item);
									else if (item.canConfigure) model.configure(item);
									else if (item.usesOAuth && !item.authorized) model.setup(item);
								}
							}}
						/>
					</>
				) : null}
			</DrawerContent>
		</Drawer>
	);
}
