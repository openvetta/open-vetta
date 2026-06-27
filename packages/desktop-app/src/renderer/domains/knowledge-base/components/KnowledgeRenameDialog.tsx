import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Input } from "@shared/components/ui/input";

interface KnowledgeRenameDialogProps {
	title: string;
	initialName: string;
	onClose: () => void;
	onSubmit: (newName: string) => void;
}

/** 通用重命名对话框：用于知识库 / 库内文件目录改名。 */
export function KnowledgeRenameDialog({
	title,
	initialName,
	onClose,
	onSubmit,
}: KnowledgeRenameDialogProps): JSX.Element {
	const { t } = useTranslation("common");
	const [name, setName] = useState(initialName);
	const trimmed = name.trim();
	const canSubmit = trimmed.length > 0 && trimmed !== initialName && !/[\\/]/.test(trimmed);

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[420px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<Input
					value={name}
					onChange={(event) => setName(event.target.value)}
					className="h-9 bg-background text-[12px]"
					autoFocus
					onKeyDown={(event) => {
						if (event.key === "Enter" && canSubmit) onSubmit(trimmed);
					}}
				/>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						{t("actions.cancel")}
					</Button>
					<Button variant="primary" disabled={!canSubmit} onClick={() => onSubmit(trimmed)}>
						{t("actions.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
