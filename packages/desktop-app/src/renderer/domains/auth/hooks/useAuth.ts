import { fetchCurrentUser, onUnauthorized } from "@shared/lib/api";
import {
	authTokenAtom,
	authUserAtom,
	loginDialogOpenAtom,
	remoteProvidersAtom,
	sseClientAtom,
	sseConnectionStateAtom,
} from "@shared/store/atoms";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";

export function useAuth() {
	const [token, setToken] = useAtom(authTokenAtom);
	const [user, setUser] = useAtom(authUserAtom);
	const setLoginOpen = useSetAtom(loginDialogOpenAtom);
	const setRemoteProviders = useSetAtom(remoteProvidersAtom);
	const sseClient = useAtomValue(sseClientAtom);
	const setSseState = useSetAtom(sseConnectionStateAtom);

	const logout = useCallback(() => {
		setToken(null);
		setUser(null);
		localStorage.removeItem("vetta-auth-token");
		// Clear server token from settings.json
		void window.vetta.settings.setServerToken(undefined);
		// Clear remote providers
		setRemoteProviders({});
		// Disconnect SSE
		sseClient.disconnect();
	}, [setToken, setUser, setRemoteProviders, sseClient]);

	// On mount: if we have a token, fetch user info
	useEffect(() => {
		if (token && !user) {
			void fetchCurrentUser(token)
				.then((u) => setUser(u))
				.catch(() => {
					// Token invalid, clear
					logout();
				});
		}
	}, [token, user, setUser, logout]);

	// Listen for 401 responses - auto logout
	useEffect(() => {
		return onUnauthorized(() => {
			logout();
		});
	}, [logout]);

	// Listen for OAuth callback from main process
	useEffect(() => {
		const cleanup = window.vetta.auth.onOAuthCallback((data) => {
			setToken(data.token);
			localStorage.setItem("vetta-auth-token", data.token);
			setLoginOpen(false);
			// Save token to settings.json for coding-agent to use
			void window.vetta.settings.setServerToken(data.token);
			// Fetch user info
			void fetchCurrentUser(data.token)
				.then((u) => setUser(u))
				.catch(console.error);
			// Re-fetch remote models with new token
			void window.vetta.models.fetchRemote().then((result) => {
				if (result.providers && Object.keys(result.providers).length > 0) {
					setRemoteProviders(result.providers);
				}
			});
		});
		return cleanup;
	}, [setToken, setUser, setLoginOpen, setRemoteProviders]);

	// SSE: connect when token is available, disconnect on logout
	useEffect(() => {
		if (!token) return;
		void window.vetta.settings.getServerUrl().then((baseUrl) => {
			sseClient.connect(baseUrl, token);
		});
		const unsubState = sseClient.onStateChange(setSseState);
		return () => {
			unsubState();
		};
	}, [token, sseClient, setSseState]);

	return { token, user, logout };
}
