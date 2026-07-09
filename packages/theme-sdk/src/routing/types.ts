export type ThemeRouteArea =
	| "automation"
	| "batchTasks"
	| "chat"
	| "downloads"
	| "knowledgeBase"
	| "project"
	| "settings"
	| "skills"
	| "themePage"
	| "unknown";

export interface ThemeRouteState {
	readonly area: ThemeRouteArea;
	readonly pathname: string;
}

export type ThemeNavigationTarget =
	| { readonly kind: "automation" }
	| { readonly kind: "batchTasks" }
	| { readonly kind: "chat" }
	| { readonly kind: "downloads" }
	| { readonly kind: "knowledgeBase" }
	| { readonly kind: "knowledgeBaseList" }
	| { readonly kind: "skills" };

export interface ThemeRouteModel {
	readonly current: ThemeRouteState;
	readonly isAreaActive: (area: ThemeRouteArea) => boolean;
	readonly navigate: (target: ThemeNavigationTarget) => void;
}

export interface RoutingThemeHost {
	readonly useThemeRouteModel: () => ThemeRouteModel;
}
