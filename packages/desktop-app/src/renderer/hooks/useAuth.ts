import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { fetchCurrentUser } from "../lib/api";
import { authTokenAtom, authUserAtom, loginDialogOpenAtom } from "../store/atoms";

export function useAuth() {
	const [token, setToken] = useAtom(authTokenAtom);
	const [user, setUser] = useAtom(authUserAtom);
	const setLoginOpen = useSetAtom(loginDialogOpenAtom);

	// On mount: if we have a token, fetch user info
	useEffect(() => {
		if (token && !user) {
			void fetchCurrentUser(token)
				.then((u) => setUser(u))
				.catch(() => {
					// Token invalid, clear
					setToken(null);
					setUser(null);
					localStorage.removeItem("vetta-auth-token");
				});
		}
	}, [token, user, setToken, setUser]);

	// Listen for OAuth callback from main process
	useEffect(() => {
		const cleanup = window.vetta.auth.onOAuthCallback((data) => {
			setToken(data.token);
			localStorage.setItem("vetta-auth-token", data.token);
			setLoginOpen(false);
			// Fetch user info
			void fetchCurrentUser(data.token)
				.then((u) => setUser(u))
				.catch(console.error);
		});
		return cleanup;
	}, [setToken, setUser, setLoginOpen]);

	const logout = useCallback(() => {
		setToken(null);
		setUser(null);
		localStorage.removeItem("vetta-auth-token");
	}, [setToken, setUser]);

	return { token, user, logout };
}
