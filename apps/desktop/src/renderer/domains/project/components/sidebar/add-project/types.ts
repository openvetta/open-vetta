export interface AddProjectMenuProps {
	className?: string;
	variant?: "icon" | "navItem" | "primary" | "secondary";
}

export type AddProjectMenuAction =
	| "newProject"
	| "openProject"
	| "importProject"
	| "addFromRemoteHost"
	| "cloneFromGit";

export interface AddProjectMenuItemModel {
	action: AddProjectMenuAction;
	icon: string;
	labelKey:
		| "actions.newProject"
		| "actions.openProject"
		| "actions.importProject"
		| "actions.addFromRemoteHost"
		| "actions.cloneFromGit";
	descriptionKey:
		| "addProjectSplash.items.newProject"
		| "addProjectSplash.items.openProject"
		| "addProjectSplash.items.importProject"
		| "addProjectSplash.items.addFromRemoteHost"
		| "addProjectSplash.items.cloneFromGit";
	onSelect: () => void;
}
