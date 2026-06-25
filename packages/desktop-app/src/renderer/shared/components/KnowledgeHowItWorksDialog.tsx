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

interface Step {
	icon: string;
	title: string;
	desc: string;
}

const STEPS: Step[] = [
	{
		icon: "icon-[mdi--folder-plus-outline]",
		title: "放入资料",
		desc: "把文件、文档拖进知识库，像整理文件夹一样按目录管理。",
	},
	{
		icon: "icon-[mdi--robot-outline]",
		title: "AI 自动整理",
		desc: "后台调用 AI 把每份资料逐篇通读、提炼成方便检索的笔记。资料越多、越大，这一步消耗的 Token 越多。",
	},
	{
		icon: "icon-[mdi--chat-question-outline]",
		title: "聊天时自动参考",
		desc: "你提问时，AI 先在这些笔记里找相关内容再作答，把命中的片段一起读进对话，这也会额外消耗 Token。",
	},
];

export function KnowledgeHowItWorksDialog({
	open,
	onClose,
}: KnowledgeHowItWorksDialogProps): JSX.Element {
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="gap-0 p-0 sm:max-w-[560px]">
				<DialogHeader className="gap-3 border-b border-border px-6 pb-5 pt-6">
					<div className="flex items-start gap-3.5">
						<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15">
							<span className="icon-[mdi--lightbulb-on-outline] h-5 w-5" />
						</div>
						<div className="min-w-0">
							<DialogTitle className="text-[16px]">知识库是怎么工作的</DialogTitle>
							<DialogDescription className="mt-1 text-[12.5px] leading-relaxed">
								简单三步，了解资料如何变成 AI 能用的知识，以及 Token 花在哪里。
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
							<li key={step.title} className="relative flex items-start gap-3.5">
								<span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground shadow-sm">
									{index + 1}
								</span>
								<div className="min-w-0 pt-0.5">
									<div className="flex items-center gap-1.5">
										<span className={`${step.icon} h-4 w-4 text-muted-foreground`} />
										<span className="text-[13.5px] font-semibold text-foreground">
											{step.title}
										</span>
									</div>
									<p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
										{step.desc}
									</p>
								</div>
							</li>
						))}
					</ol>

					<div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] p-3.5">
						<span className="icon-[mdi--alert-circle-outline] mt-px h-4 w-4 shrink-0 text-amber-500" />
						<p className="text-[12.5px] leading-relaxed text-muted-foreground">
							<span className="font-semibold text-foreground">为什么会消耗 Token？</span>{" "}
							整理资料和回答提问都需要 AI 通读内容，资料越多、提问越频繁，消耗越大。如果暂时不需要，可在「设置 ·
							知识库设置」里调低整理频率或关闭知识库。
						</p>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
