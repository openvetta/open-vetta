import type { PetConfig } from "../../shared/pet-config.js";

export interface PetDecoration {
	id: string;
	fileName: string;
	label: string;
	found: boolean;
	url: string;
}

export interface DesktopPetApi {
	getConfig(): Promise<PetConfig>;
	setConfig(patch: Partial<PetConfig>): Promise<PetConfig>;
	show(): Promise<PetConfig>;
	hide(): Promise<PetConfig>;
	getDecorations(): Promise<PetDecoration[]>;
}
