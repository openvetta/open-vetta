import { contextBridge, type IpcRendererEvent, ipcRenderer } from "electron";
import { PET_COMMAND_CHANNEL, type PetBridge, type PetCommand } from "../shared/pet-ipc.js";

const api: PetBridge = {
	onCommand(listener) {
		const handler = (_event: IpcRendererEvent, command: PetCommand) => {
			listener(command);
		};
		ipcRenderer.on(PET_COMMAND_CHANNEL, handler);
		return () => ipcRenderer.removeListener(PET_COMMAND_CHANNEL, handler);
	},
};

contextBridge.exposeInMainWorld("vettaPet", api);
