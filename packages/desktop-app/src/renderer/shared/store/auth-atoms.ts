import { atom } from "jotai";

export interface AuthUser {
	id: number;
	username: string;
	phone?: string;
	email?: string;
	avatar: string;
}

export const authTokenAtom = atom<string | null>(localStorage.getItem("vetta-auth-token"));
export const authUserAtom = atom<AuthUser | null>(null);
export const loginDialogOpenAtom = atom<boolean>(false);

// ─── Remote providers (from server) ───

export const remoteProvidersAtom = atom<Record<string, unknown>>({});
