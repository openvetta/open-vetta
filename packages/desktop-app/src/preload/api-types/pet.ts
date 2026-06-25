import type { PetConfig } from "../../shared/pet-config.js";

export interface DesktopPetApi {
	getConfig(): Promise<PetConfig>;
	setConfig(patch: Partial<PetConfig>): Promise<PetConfig>;
	show(): Promise<PetConfig>;
	hide(): Promise<PetConfig>;
}
