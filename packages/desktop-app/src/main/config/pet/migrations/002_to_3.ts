import { DEFAULT_PET_BUBBLE_STYLE_ID } from "../../../../shared/pet-bubbles.js";
import type { VersionedConfigMigration } from "../../versioned-config.js";

export const petConfigMigration002To3: VersionedConfigMigration = {
	fromVersion: 2,
	toVersion: 3,
	migrate(config) {
		return {
			...config,
			bubbleStyleId: config.bubbleStyleId ?? DEFAULT_PET_BUBBLE_STYLE_ID,
		};
	},
};
