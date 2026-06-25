import { ipcMain } from "electron";
import { normalizePetConfig, type PetConfig } from "../../shared/pet-config.js";
import { applyPetConfig, showPetWindow } from "../pet-window.js";
import { readDesktopConfig, writeDesktopConfig } from "./fs.js";

const CHANNELS = {
	GET_CONFIG: "vetta:pet:get-config",
	SET_CONFIG: "vetta:pet:set-config",
	SHOW: "vetta:pet:show",
	HIDE: "vetta:pet:hide",
} as const;

async function persistPetConfig(patch: Partial<PetConfig>): Promise<PetConfig> {
	const current = await readDesktopConfig();
	const nextPet = normalizePetConfig({ ...current.pet, ...patch });
	await writeDesktopConfig({ ...current, pet: nextPet });
	applyPetConfig(nextPet);
	return nextPet;
}

export function registerPetIpc(): () => void {
	ipcMain.handle(CHANNELS.GET_CONFIG, async (): Promise<PetConfig> => {
		const config = await readDesktopConfig();
		return normalizePetConfig(config.pet);
	});

	ipcMain.handle(CHANNELS.SET_CONFIG, async (_event, patch: unknown): Promise<PetConfig> => {
		if (typeof patch !== "object" || patch === null) {
			throw new Error("Invalid pet config");
		}
		return persistPetConfig(patch as Partial<PetConfig>);
	});

	ipcMain.handle(CHANNELS.SHOW, async (): Promise<PetConfig> => {
		const next = await persistPetConfig({ enabled: true });
		showPetWindow();
		return next;
	});

	ipcMain.handle(CHANNELS.HIDE, async (): Promise<PetConfig> => {
		return persistPetConfig({ enabled: false });
	});

	return () => {
		ipcMain.removeHandler(CHANNELS.GET_CONFIG);
		ipcMain.removeHandler(CHANNELS.SET_CONFIG);
		ipcMain.removeHandler(CHANNELS.SHOW);
		ipcMain.removeHandler(CHANNELS.HIDE);
	};
}
