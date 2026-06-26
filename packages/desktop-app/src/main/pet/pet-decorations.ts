import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { PetDecoration } from "../../preload/api-types/pet.js";
import { allowProjectRoot } from "../ipc/fs.js";
import { MEDIA_PROTOCOL_SCHEME } from "../media-protocol.js";

const appRoot = app.isPackaged ? app.getAppPath() : process.cwd();
const buildDir = app.isPackaged ? join(process.resourcesPath, "build") : join(appRoot, "build");
const petMediaDir = join(buildDir, "pet");

const PET_DECORATIONS = [
	{ id: "monitor", fileName: "blank_black_computer_monitor.png", label: "显示器" },
	{ id: "santa", fileName: "stoat_christmas_santa_outfit.png", label: "圣诞装" },
	{ id: "business", fileName: "stoat_business_suit_lawyer.png", label: "商务装" },
	{ id: "office", fileName: "stoat_pray_microsoft_office.png", label: "办公祈祷" },
	{ id: "peeking-monitor", fileName: "stoat_peeking_from_monitor.png", label: "探出显示器" },
	{ id: "dragon-boat", fileName: "stoat_dragon_boat_festival.png", label: "端午装饰" },
] as const;

export function getPetDecorations(): PetDecoration[] {
	allowProjectRoot(petMediaDir);
	return PET_DECORATIONS.map((decoration) => {
		const path = join(petMediaDir, decoration.fileName);
		return {
			...decoration,
			found: existsSync(path),
			url: `${MEDIA_PROTOCOL_SCHEME}://local/stream?path=${encodeURIComponent(path)}`,
		};
	});
}
