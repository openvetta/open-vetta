import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@shared/components/ui/button";
import { MessageCenterContent } from "./MessageCenterContent";
import { MessageCenterTabs } from "./MessageCenterTabs";
import { MESSAGE_CENTER_SPRING, type MessageCenterTab } from "./types";

export function MessageCenterDialog({
	activeTab,
	chatUnread,
	notifUnread,
	open,
	pendingCount,
	onClose,
	onOpenChange,
	onSelectTab,
}: {
	activeTab: MessageCenterTab;
	chatUnread: number;
	notifUnread: number;
	open: boolean;
	pendingCount: number;
	onClose: () => void;
	onOpenChange: (open: boolean) => void;
	onSelectTab: (tab: MessageCenterTab) => void;
}): JSX.Element {
	const { t } = useTranslation("message");

	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			<AnimatePresence>
				{open && (
					<DialogPrimitive.Portal forceMount>
						<DialogPrimitive.Overlay asChild forceMount>
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.18 }}
								className="fixed inset-0 z-50 bg-background/10 supports-backdrop-filter:backdrop-blur-[1px]"
							/>
						</DialogPrimitive.Overlay>

						<DialogPrimitive.Content
							asChild
							forceMount
							aria-describedby={undefined}
							onOpenAutoFocus={(event) => event.preventDefault()}
						>
							<motion.div
								initial={{ opacity: 0, scale: 0.95, y: -10 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.96, y: -8, transition: { duration: 0.14 } }}
								transition={MESSAGE_CENTER_SPRING}
								style={{ transformOrigin: "top right" }}
								className="fixed right-3 top-12 z-50 flex max-h-[min(560px,calc(100vh-5rem))] w-[420px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-lg outline-none"
							>
								<div className="relative flex items-center justify-between px-5 pt-4 pb-3">
									<div className="flex items-center gap-2">
										<span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/15">
											<span className="icon-[solar--bell-linear] h-3.5 w-3.5 text-primary" />
										</span>
										<DialogPrimitive.Title className="text-[14px] font-semibold text-foreground">
											{t("title")}
										</DialogPrimitive.Title>
									</div>
									<Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
										<span className="icon-[solar--close-circle-linear] h-4 w-4" />
									</Button>
								</div>

								<MessageCenterTabs
									activeTab={activeTab}
									chatUnread={chatUnread}
									notifUnread={notifUnread}
									pendingCount={pendingCount}
									onSelect={onSelectTab}
								/>

								<MessageCenterContent
									activeTab={activeTab}
									chatUnread={chatUnread}
									notifUnread={notifUnread}
									pendingCount={pendingCount}
									onClose={onClose}
								/>
							</motion.div>
						</DialogPrimitive.Content>
					</DialogPrimitive.Portal>
				)}
			</AnimatePresence>
		</DialogPrimitive.Root>
	);
}
