import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";

interface NewProjectDialogProps {
	onConfirm: (name: string) => void;
	onCancel: () => void;
}

export function NewProjectDialog({ onConfirm, onCancel }: NewProjectDialogProps): JSX.Element {
	const [name, setName] = useState("");
	const [error, setError] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const handleSubmit = useCallback(() => {
		const trimmed = name.trim();
		if (!trimmed) {
			setError("请输入项目名称");
			return;
		}
		if (/[/\\:*?"<>|]/.test(trimmed)) {
			setError("项目名称不能包含特殊字符");
			return;
		}
		onConfirm(trimmed);
	}, [name, onConfirm]);

	return (
		<Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
			<DialogContent
				showCloseButton={false}
				onEscapeKeyDown={(e) => { e.preventDefault(); onCancel(); }}
				onInteractOutside={(e) => e.preventDefault()}
			>
				<p className="mb-1 text-[13px] font-semibold text-foreground">
					新建项目
				</p>
				<p className="mb-3 text-[12px] text-muted-foreground/50">
					将在工作目录下创建一个新的项目文件夹。
				</p>
				<input
					ref={inputRef}
					type="text"
					value={name}
					onChange={(e) => { setName(e.target.value); setError(""); }}
					onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
					placeholder="输入项目名称"
					className="mb-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-input"
				/>
				{error && (
					<p className="mb-1 text-[11px] text-destructive">{error}</p>
				)}
				<div className="mt-3 flex justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={onCancel}>
						取消
					</Button>
					<Button variant="primary" size="sm" onClick={handleSubmit}>
						创建
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
