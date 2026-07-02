import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@shared/components/ui/button";
import { flowingPendingListAtom } from "@shared/store/atoms";
import { useFlowingReceive } from "@domains/flowing/hooks/useFlowingReceive";
import { formatRelativeTime } from "./formatRelativeTime";
import { MessageCenterEmptyState } from "./MessageCenterEmptyState";

export function FlowingMessageList(): JSX.Element {
	const { t } = useTranslation("message");
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	if (pendingList.length === 0) {
		return <MessageCenterEmptyState text={t("empty.flowing")} icon="icon-[solar--transfer-horizontal-linear]" />;
	}

	return (
		<div className="flex flex-col gap-1.5 p-3">
			<AnimatePresence initial={false}>
				{pendingList.map((tx, index) => (
					<motion.div
						key={tx.id}
						layout
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, padding: 0 }}
						transition={{ duration: 0.2, delay: index * 0.03 }}
						className="group rounded-xl border border-border/60 bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30"
					>
						<div className="flex items-start gap-3">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
								<span className="icon-[solar--user-circle-linear] h-4 w-4 text-primary" />
							</div>

							<div className="min-w-0 flex-1">
								<p className="text-[12px] leading-snug">
									<span className="font-semibold text-foreground">{tx.sender_name}</span>
									<span className="text-muted-foreground">{t("flowing.shared")}</span>
									<span className="font-semibold text-foreground">{tx.project_name}</span>
								</p>

								{tx.message && (
									<p className="mt-1.5 line-clamp-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
										{tx.message}
									</p>
								)}

								<div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground/50">
									<span className="flex items-center gap-1">
										<span className="icon-[solar--documents-minimalistic-linear] h-3 w-3" />
										{t("flowing.fileCount", { count: tx.file_list.length })}
									</span>
									<span>{formatRelativeTime(tx.created_at)}</span>
								</div>

								<div className="mt-2.5 flex gap-2">
									<Button
										size="sm"
										variant="outline"
										className="h-7 rounded-lg px-3.5 text-[11px] font-medium"
										onClick={() => reject(tx)}
										disabled={processing}
									>
										{t("flowing.reject")}
									</Button>
									<Button
										size="sm"
										className="h-7 rounded-lg px-3.5 text-[11px] font-medium"
										onClick={() => accept(tx)}
										disabled={processing}
									>
										{processing ? t("flowing.processing") : t("flowing.accept")}
									</Button>
								</div>
							</div>
						</div>
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
