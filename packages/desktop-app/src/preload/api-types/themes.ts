export type DesktopThemePackageSource = "builtin" | "remote";

export interface DesktopThemePackage {
	id: string;
	displayName: Record<string, string>;
	version: string;
	sdkVersion: string;
	source: DesktopThemePackageSource;
	entryUrl: string;
	styleUrls: string[];
	moduleFederation: {
		remoteName: string;
		expose: string;
	};
}

export interface DesktopThemesApi {
	list(): Promise<DesktopThemePackage[]>;
}
