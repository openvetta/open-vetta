import { pathBasename } from "@shared/lib/utils";
import { knowledgeImportDraftAtom } from "@shared/store/atoms";
import type { KnowledgeImportItem } from "@shared/types/knowledge-base";
import { useSetAtom } from "jotai";
import { useCallback, useRef } from "react";

function filesToImportItems(files: FileList): KnowledgeImportItem[] {
	return Array.from(files).map((file) => ({
		name: file.name,
		path: window.vetta.fs.pathForFile(file),
		relativePath: file.webkitRelativePath || file.name,
		isDirectory: false,
		size: file.size,
	}));
}

export function useKnowledgeImportSources() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const setDraft = useSetAtom(knowledgeImportDraftAtom);

	const openFilePicker = useCallback((targetKnowledgeBaseId: string | null) => {
		if (!fileInputRef.current) return;
		fileInputRef.current.dataset.targetKnowledgeBaseId = targetKnowledgeBaseId ?? "";
		fileInputRef.current.click();
	}, []);

	const openFolderPicker = useCallback(
		async (targetKnowledgeBaseId: string | null) => {
			const paths = await window.vetta.dialog.selectFolders();
			if (paths.length === 0) return;
			// TODO(knowledge-base-integration): 目录递归扫描、忽略规则与文件计数应由主进程
			// 知识库服务完成；当前仅保留顶层目录用于 UI 整理预览。
			setDraft({
				items: paths.map((path) => {
					const name = pathBasename(path);
					return { name, path, relativePath: name, isDirectory: true, size: 0 };
				}),
				targetKnowledgeBaseId,
				source: "picker",
			});
		},
		[setDraft],
	);

	const onFilesPicked = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const items = event.target.files ? filesToImportItems(event.target.files) : [];
			const targetKnowledgeBaseId = event.target.dataset.targetKnowledgeBaseId || null;
			event.target.value = "";
			if (items.length === 0) return;
			setDraft({ items, targetKnowledgeBaseId, source: "picker" });
		},
		[setDraft],
	);

	return { fileInputRef, openFilePicker, openFolderPicker, onFilesPicked };
}
