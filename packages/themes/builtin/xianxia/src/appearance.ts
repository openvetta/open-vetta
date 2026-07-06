import type { ThemeAppearance, ThemeSurfaceFrame } from "@vetta/theme-sdk";
import { xianxiaAssets } from "./assets";

const xianxiaPanelFrame: ThemeSurfaceFrame = {
	kind: "nine-slice-image",
	imageUrl: xianxiaAssets.panelFrame,
	decoration: {
		borderWidth: "33px",
		outset: "2px",
		repeat: "stretch",
		slice: 198,
	},
};

const xianxiaPanelSurface = {
	frame: xianxiaPanelFrame,
	surfaceClassName: "xianxia-frame-glow-silver overflow-visible",
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
		"activity.panel": xianxiaPanelSurface,
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
			rootClassName: "xianxia-app-frame",
		},
		"app.frameOverlay": {
			surfaceClassName: "xianxia-app-frame-overlay",
		},
		"sidebar.panel": {
			rootClassName: "xianxia-sidebar-background border-transparent bg-primary-foreground/80",
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
		"chat.atPanel": xianxiaPanelSurface,
		"chat.newSessionPage": { rootClassName: "bg-transparent" },
		"chat.sessionViewerPage": { rootClassName: "bg-transparent" },
		"chat.view": { rootClassName: "bg-transparent" },
		"chat.executionModeMenu": xianxiaPanelSurface,
		"chat.inputBar": {
			frame: {
				kind: "nine-slice-image",
				imageUrl: xianxiaAssets.inputBarFrame,
				decoration: {
					borderWidth: "33px",
					outset: "2px",
					repeat: "stretch",
					slice: 230,
				},
			},
			rootClassName: "xianxia-input-bar-background border-transparent bg-card/80 dark:bg-card/80",
			surfaceClassName: "xianxia-frame-glow-gold z-[2] overflow-visible",
		},
		"chat.sendButton": {
			frame: {
				kind: "background-image",
				imageUrl: xianxiaAssets.sendButtonFrame,
				decoration: {
					position: "center",
					repeat: "no-repeat",
					size: "40px 40px",
				},
			},
			surfaceClassName: "xianxia-frame-glow-silver -inset-1 z-20 overflow-visible",
		},
		"chat.inputDrawer": xianxiaPanelSurface,
		"chat.modelSelectorMenu": xianxiaPanelSurface,
		"chat.modelSelectorReasoningMenu": xianxiaPanelSurface,
		"chat.newSessionSceneCard": {
			...xianxiaPanelSurface,
			rootClassName: "xianxia-scene-card-background border-transparent bg-card/80",
			surfaceClassName: "xianxia-frame-glow-gold overflow-visible",
		},
		"chat.newSessionSkillCard": {
			frame: {
				kind: "nine-slice-image",
				imageUrl: xianxiaAssets.skillFrame,
				decoration: {
					borderWidth: "16px",
					outset: "2px",
					repeat: "stretch",
					slice: 213,
				},
			},
			rootClassName: "xianxia-skill-card-background border-transparent bg-card/80",
			surfaceClassName: "xianxia-frame-glow-gold overflow-visible",
		},
		"chat.questionPanel": xianxiaPanelSurface,
		"chat.slashPanel": xianxiaPanelSurface,
		"root.confirmDialog.panel": xianxiaPanelSurface,
		"root.filePreviewDialog": xianxiaPanelSurface,
		"root.filePreviewDialog.panel": xianxiaPanelSurface,
		"root.flowingSendDialog.panel": xianxiaPanelSurface,
		"root.genericActionApproval.panel": xianxiaPanelSurface,
		"root.knowledgeDropOverlay": xianxiaPanelSurface,
		"root.loginDialog.panel": xianxiaPanelSurface,
		"root.approval.appearance.panel": xianxiaPanelSurface,
		"root.approval.batchTasks.panel": xianxiaPanelSurface,
		"root.approval.navigationOpen.panel": xianxiaPanelSurface,
		"root.approval.schedulerAction.panel": xianxiaPanelSurface,
		"root.approval.schedulerEdit.panel": xianxiaPanelSurface,
		"root.updateRestartDialog.panel": xianxiaPanelSurface,
		"root.workflowCompleteDialog.panel": xianxiaPanelSurface,
		"settings.pageContent": { rootClassName: "bg-transparent" },
	},
};
