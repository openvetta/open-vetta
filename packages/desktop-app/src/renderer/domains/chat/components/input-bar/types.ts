import type { SkillInfo } from "@preload/api";
import type { AppshotAttachment, AttachedImage, MentionedFile } from "@shared/store/atoms";
import type { TodoItem } from "@shared/store/todo-atoms";
import type { ChangeEvent, ClipboardEvent, ComponentProps, KeyboardEvent, RefObject } from "react";
import type { SelectedFile } from "../AtPanel";
import type { QuestionPanel } from "../QuestionPanel";

export interface InputBarProps {
	onSend: (overrideText?: string) => Promise<void>;
	onAbort: () => Promise<void>;
	onSendQueued?: (runtimeId: string, id: string) => void;
	/**
	 * 当无 activeSession 但仍希望放行输入与发送时（例如 NewSessionPage），
	 * 把该项目的 cwd 传进来：InputBar 把它视为「有会话」、@ 文件面板用它作为根目录。
	 */
	cwdOverride?: string;
}

export interface InputBarLabels {
	capsule: {
		editImage: string;
		removeDefault: string;
		removeImage: string;
		removeTooltip: (path: string) => string;
	};
	hint: {
		send: string;
		newline: string;
	};
	permission: {
		deny: string;
		allow: string;
		allowSession: string;
	};
	toolbar: {
		skills: string;
		addImage: string;
		attachFile: string;
		queue: string;
	};
}

export interface SandboxPermissionRequestModel {
	title: string;
	message: string;
	sensitive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	onAllowSession?: () => void;
}

export type InputBarDrawerItem =
	| {
			kind: "sandbox-permission";
			id: string;
			label: string;
			desc: string;
			pulsing: boolean;
			request: SandboxPermissionRequestModel;
	  }
	| {
			kind: "queue";
			id: string;
			label: string;
			desc: string;
			runtimeId: string;
			onSendNow: (id: string) => void;
	  }
	| {
			kind: "todo";
			id: string;
			label: string;
			desc: string;
			pulsing: boolean;
			items: readonly TodoItem[];
			onViewMore: () => void;
	  };

export interface InputBarModel {
	inputValue: string;
	isStreaming: boolean;
	pendingQuestion: ComponentProps<typeof QuestionPanel>["pending"] | undefined;
	firstSuggestion?: string;
	attachedImages: AttachedImage[];
	selectedSkill: { name: string; alias?: string; type: string } | null;
	mentionedFiles: MentionedFile[];
	appshotAttachment: AppshotAttachment | null;
	hasSession: boolean;
	canSend: boolean;
	isEmpty: boolean;
	hasCapsules: boolean;
	effectiveCwd: string;
	placeholder: string;
	isFocused: boolean;
	slashOpen: boolean;
	atOpen: boolean;
	drawerItems: InputBarDrawerItem[];
	drawerActiveTab: string | null;
	hasEditImageAttachment: boolean;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	labels: InputBarLabels;
	actions: {
		setFocused: (focused: boolean) => void;
		setDrawerActiveTab: (tabId: string | null) => void;
		handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
		handleChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
		handlePaste: (e: ClipboardEvent) => Promise<void>;
		handleSlashClose: () => void;
		handleSlashSelect: (skill: SkillInfo) => void;
		handleAtClose: () => void;
		handleAtSelect: (file: SelectedFile) => void;
		getAtFilter: () => string;
		removeImage: (id: string) => void;
		removeSkill: () => void;
		removeFile: (path: string) => void;
		removeEditImage: () => void;
		removeAppshot: () => void;
		handlePlusClick: () => void;
		handleSelectImages: () => Promise<void>;
		handleSelectFiles: () => Promise<void>;
		handleSend: () => void;
		handleAbort: () => void;
	};
}

export interface InputBarViewClassNames {
	root?: string;
	stack?: string;
	card?: string;
	cardContent?: string;
	capsules?: string;
	textareaWrap?: string;
	toolbar?: string;
}

export interface InputBarViewProps {
	model: InputBarModel;
	className?: string;
	classNames?: InputBarViewClassNames;
}
