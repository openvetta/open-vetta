import type { ReactNode } from "react";
import { Input } from "../components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import { Switch } from "../components/ui/switch";
import { Textarea } from "../components/ui/textarea";

export interface SchedulerEditableData {
	name?: string;
	prompt?: string;
	cron?: string;
	isOnce?: boolean;
	enabled?: boolean;
	cwd?: string;
	modelKey?: string | null;
	executionMode?: "inherit" | "sandbox" | "full-access";
}

interface SchedulerApprovalFieldsProps {
	value: SchedulerEditableData;
	onChange: (value: SchedulerEditableData) => void;
}

function Field({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}): JSX.Element {
	return (
		<label className="grid gap-1.5 text-[12px] font-medium text-foreground">
			{label}
			{children}
		</label>
	);
}

export function SchedulerApprovalFields({
	value,
	onChange,
}: SchedulerApprovalFieldsProps): JSX.Element {
	const set = <Key extends keyof SchedulerEditableData>(
		key: Key,
		nextValue: SchedulerEditableData[Key],
	): void => {
		onChange({ ...value, [key]: nextValue });
	};

	return (
		<div className="space-y-4">
			<Field label="任务名称">
				<Input
					value={value.name ?? ""}
					onChange={(event) => set("name", event.target.value)}
				/>
			</Field>
			<Field label="任务提示词">
				<Textarea
					value={value.prompt ?? ""}
					className="min-h-32 resize-y"
					onChange={(event) => set("prompt", event.target.value)}
				/>
			</Field>
			<div className="grid grid-cols-2 gap-3">
				<Field label="Cron 表达式">
					<Input
						value={value.cron ?? ""}
						className="font-mono"
						onChange={(event) => set("cron", event.target.value)}
					/>
				</Field>
				<Field label="工作目录">
					<Input
						value={value.cwd ?? ""}
						onChange={(event) => set("cwd", event.target.value)}
					/>
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<Field label="模型">
					<Input
						value={value.modelKey ?? ""}
						placeholder="使用默认模型"
						onChange={(event) => set("modelKey", event.target.value || null)}
					/>
				</Field>
				<Field label="权限模式">
					<Select
						value={value.executionMode ?? "inherit"}
						onValueChange={(nextValue) =>
							set("executionMode", nextValue as SchedulerEditableData["executionMode"])
						}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="inherit">继承项目设置</SelectItem>
							<SelectItem value="sandbox">沙箱模式</SelectItem>
							<SelectItem value="full-access">完全访问</SelectItem>
						</SelectContent>
					</Select>
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<label className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 text-[12px] text-foreground">
					单次执行
					<Switch checked={value.isOnce ?? false} onCheckedChange={(checked) => set("isOnce", checked)} />
				</label>
				<label className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 p-3 text-[12px] text-foreground">
					启用任务
					<Switch checked={value.enabled ?? true} onCheckedChange={(checked) => set("enabled", checked)} />
				</label>
			</div>
		</div>
	);
}
