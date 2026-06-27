import { useTranslation } from "react-i18next";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";

interface KnowledgeHowItWorksDialogProps {
	open: boolean;
	onClose: () => void;
}

const STEPS = [
	{
		icon: "icon-[mdi--folder-plus-outline]",
		titleKey: "kbHiwStep1Title",
		descKey: "kbHiwStep1Desc",
	},
	{
		icon: "icon-[mdi--robot-outline]",
		titleKey: "kbHiwStep2Title",
		descKey: "kbHiwStep2Desc",
	},
	{
		icon: "icon-[mdi--chat-question-outline]",
		titleKey: "kbHiwStep3Title",
		descKey: "kbHiwStep3Desc",
	},
] as const;

export function KnowledgeHowItWorksDialog({
	open,
	onClose,
}: KnowledgeHowItWorksDialogProps): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="gap-0 p-0 sm:max-w-[560px]">
				<DialogHeader className="gap-3 border-b border-border px-6 pb-5 pt-6">
					<div className="flex items-start gap-3.5">
						<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
							<span className="icon-[mdi--lightbulb-on-outline] h-5 w-5" />
						</div>
						<div className="min-w-0">
							<DialogTitle className="text-[16px]">{t("kbHiwTitle")}</DialogTitle>
							<DialogDescription className="mt-1 text-[12.5px] leading-relaxed">
								{t("kbHiwSubtitle")}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="px-6 py-5">
					<ol className="relative flex flex-col gap-5">
						{/* 贯穿步骤序号的竖线，连接 1→2→3 */}
						<span
							aria-hidden
							className="absolute left-[15px] top-4 bottom-4 w-px bg-border"
						/>
						{STEPS.map((step, index) => (
							<li key={step.titleKey} className="relative flex items-start gap-3.5">
								<span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground shadow-sm">
									{index + 1}
								</span>
								<div className="min-w-0 pt-0.5">
									<div className="flex items-center gap-1.5">
										<span className={`${step.icon} h-4 w-4 text-muted-foreground`} />
										<span className="text-[13.5px] font-semibold text-foreground">
											{t(step.titleKey)}
										</span>
									</div>
									<p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
										{t(step.descKey)}
									</p>
								</div>
							</li>
						))}
					</ol>

					<div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-3.5">
						<span className="icon-[mdi--alert-circle-outline] mt-px h-4 w-4 shrink-0 text-amber-500" />
						<p className="text-[12.5px] leading-relaxed text-muted-foreground">
							<span className="font-semibold text-foreground">{t("kbHiwWhyTitle")}</span>{" "}
							{t("kbHiwWhyDesc")}
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
