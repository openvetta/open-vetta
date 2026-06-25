import type { PetActionId } from "./pet-actions.js";

export const PET_COMMAND_CHANNEL = "vetta:pet:command";

export type PetCommand =
	| {
			type: "set-action";
			actionId: PetActionId;
	  }
	| {
			type: "random-action";
	  }
	| {
			type: "set-auto-mode";
			enabled: boolean;
	  };

export type PetCommandListener = (command: PetCommand) => void;

export type PetBridge = {
	onCommand(listener: PetCommandListener): () => void;
};
