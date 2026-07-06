import type { ThemeAppearance, ThemeSurfaceFrame } from "@vetta/theme-sdk";
import { xianxiaAssets } from "./assets";

const xianxiaPanelFrame: ThemeSurfaceFrame = {
	kind: "nine-slice-image",
	imageUrl: xianxiaAssets.panelFrame,
	decoration: {
		borderWidth: "28px",
		outset: "3px",
		repeat: "stretch",
		slice: 113,
	},
};

export const xianxiaAppearance: ThemeAppearance = {
	colorScheme: "light",
	colors: {
		common: {
			accent: "rgb(219, 223, 236)",
			accentForeground: "rgb(45, 51, 73)",
			background: "rgb(225, 230, 242)",
			border: "rgb(196, 202, 219)",
			card: "rgb(244, 245, 249)",
			cardForeground: "rgb(39, 45, 67)",
			foreground: "rgb(39, 45, 67)",
			input: "rgb(202, 208, 224)",
			muted: "rgb(232, 235, 244)",
			mutedForeground: "rgb(99, 106, 128)",
			popover: "rgb(246, 247, 251)",
			popoverForeground: "rgb(39, 45, 67)",
			primary: "rgb(105, 117, 153)",
			primaryForeground: "rgb(255, 255, 255)",
			ring: "rgb(127, 139, 174)",
			secondary: "rgb(230, 233, 242)",
			secondaryForeground: "rgb(48, 54, 76)",
		},
	},
	surfaces: {
		"activity.panel": { frame: xianxiaPanelFrame },
		"app.frame": {
			frame: {
				kind: "background-image",
				imageUrl: xianxiaAssets.appBackground,
				decoration: {
					position: "center",
					repeat: "no-repeat",
					size: "cover",
				},
			},
		},
		"sidebar.panel": {
			frame: xianxiaPanelFrame,
			rootClassName: "bg-transparent",
			surfaceClassName: "bg-primary-foreground/80",
		},
		"sidebar.navigationIndicator": {
			frame: {
				kind: "nine-slice-image",
				imageUrl: xianxiaAssets.buttonBackground,
				decoration: {
					borderWidth: "8px",
					outset: "3px",
					repeat: "stretch",
					slice: 90,
				},
			},
		},
		"chat.atPanel": { frame: xianxiaPanelFrame },
		"chat.newSessionPage": { rootClassName: "bg-transparent" },
		"chat.sessionViewerPage": { rootClassName: "bg-transparent" },
		"chat.view": { rootClassName: "bg-transparent" },
		"chat.executionModeMenu": { frame: xianxiaPanelFrame },
		"chat.inputBar": {
			frame: {
				kind: "nine-slice-image",
				imageUrl: xianxiaAssets.inputBarFrame,
				decoration: {
					borderWidth: "18px",
					outset: "4px",
					repeat: "stretch",
					slice: 150,
				},
			},
			rootClassName: "border-transparent",
			surfaceClassName: "z-[2]",
		},
		"chat.sendButton": {
			frame: {
				kind: "background-image",
				imageUrl: xianxiaAssets.sendButtonFrame,
				decoration: {
					position: "center",
					repeat: "no-repeat",
					size: "contain",
				},
			},
			surfaceClassName: "-inset-1 z-20 overflow-visible",
		},
		"chat.inputDrawer": { frame: xianxiaPanelFrame },
		"chat.modelSelectorMenu": { frame: xianxiaPanelFrame },
		"chat.modelSelectorReasoningMenu": { frame: xianxiaPanelFrame },
		"chat.newSessionSceneCard": {
			frame: xianxiaPanelFrame,
			rootClassName: "border-transparent",
		},
		"chat.newSessionSkillCard": {
			frame: {
				kind: "background-image",
				imageUrl: xianxiaAssets.skillFrame,
				decoration: {
					position: "center",
					repeat: "no-repeat",
					size: "100% 100%",
				},
			},
			rootClassName: "border-transparent",
			surfaceClassName: "-inset-x-1 -inset-y-0.5 overflow-visible",
		},
		"chat.questionPanel": { frame: xianxiaPanelFrame },
		"chat.slashPanel": { frame: xianxiaPanelFrame },
		"root.confirmDialog.panel": { frame: xianxiaPanelFrame },
		"root.filePreviewDialog": { frame: xianxiaPanelFrame },
		"root.filePreviewDialog.panel": { frame: xianxiaPanelFrame },
		"root.flowingSendDialog.panel": { frame: xianxiaPanelFrame },
		"root.genericActionApproval.panel": { frame: xianxiaPanelFrame },
		"root.knowledgeDropOverlay": { frame: xianxiaPanelFrame },
		"root.loginDialog.panel": { frame: xianxiaPanelFrame },
		"root.approval.appearance.panel": { frame: xianxiaPanelFrame },
		"root.approval.batchTasks.panel": { frame: xianxiaPanelFrame },
		"root.approval.navigationOpen.panel": { frame: xianxiaPanelFrame },
		"root.approval.schedulerAction.panel": { frame: xianxiaPanelFrame },
		"root.approval.schedulerEdit.panel": { frame: xianxiaPanelFrame },
		"root.updateRestartDialog.panel": { frame: xianxiaPanelFrame },
		"root.workflowCompleteDialog.panel": { frame: xianxiaPanelFrame },
		"settings.pageContent": { rootClassName: "bg-transparent" },
	},
};
