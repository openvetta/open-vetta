import type { KnowledgeBase, KnowledgeImportDraft } from "@shared/types/knowledge-base";
import { KNOWLEDGE_IMPORT_NEW_BASE, KnowledgeImportDialogView } from "@vetta-org/theme-ui/knowledge";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { knowledgeBaseDisplayName } from "../lib/knowledge-base";

export interface KnowledgeImportConfirmation {
	/** 选中已有库则为其 id；新建库则 null（用 name 创建）。 */
	targetId: string | null;
	name: string;
	sourcePaths: string[];
}

interface KnowledgeImportDialogProps {
	draft: KnowledgeImportDraft;
	activeKnowledgeBaseId: string | null;
	knowledgeBases: KnowledgeBase[];
	onClose: () => void;
	onConfirm: (confirmation: KnowledgeImportConfirmation) => void | Promise<void>;
}

export function KnowledgeImportDialog({
	draft,
	activeKnowledgeBaseId,
	knowledgeBases,
	onClose,
	onConfirm,
}: KnowledgeImportDialogProps): JSX.Element {
	const { t } = useTranslation(["settings", "common"]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const pending = useRef(false);
	const createOnly = draft.createOnly ?? false;
	const initialTarget = createOnly
		? KNOWLEDGE_IMPORT_NEW_BASE
		: (draft.defaultTargetId ?? activeKnowledgeBaseId ?? knowledgeBases[0]?.id ?? KNOWLEDGE_IMPORT_NEW_BASE);

	return (
		<KnowledgeImportDialogView
			createOnly={createOnly}
			sourcePaths={draft.sourcePaths}
			knowledgeBases={knowledgeBases.map((base) => ({
				id: base.id,
				name: knowledgeBaseDisplayName(base),
			}))}
			initialTargetId={initialTarget}
			onClose={onClose}
			submitting={submitting}
			error={error}
			onConfirm={(confirmation) => {
				if (pending.current) return;
				pending.current = true;
				setSubmitting(true);
				setError(null);
				void Promise.resolve()
					.then(() => onConfirm(confirmation))
					.catch((reason: unknown) => {
						setError(reason instanceof Error ? reason.message : t("kbPageOpFailed"));
					})
					.finally(() => {
						pending.current = false;
						setSubmitting(false);
					});
			}}
			labels={{
				createTitle: t("kbImportCreateTitle"),
				addTitle: t("kbImportAddTitle"),
				createDesc: t("kbImportCreateDesc"),
				addDesc: t("kbImportAddDesc", { n: draft.sourcePaths.length }),
				addTo: t("kbImportAddTo"),
				createBase: t("kbCreateBase"),
				nameLabel: t("kbImportNameLabel"),
				cancel: t("common:actions.cancel"),
				createBtn: t("kbImportCreateBtn"),
				startBtn: t("kbImportStartBtn"),
				newBaseName: t("kbImportNewBaseName"),
				processing: t("common:actionApproval.processing"),
			}}
		/>
	);
}
