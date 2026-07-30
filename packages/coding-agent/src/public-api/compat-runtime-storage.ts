/**
 * Compatibility exports used by the published @vetta/runtime-storage root.
 */
export {
	type AuthCredential,
	AuthStorage,
	type AuthStorageBackend,
	FileAuthStorageBackend,
	InMemoryAuthStorageBackend,
} from "../core/auth-storage.js";
export {
	type SessionContext,
	type SessionEntry,
	type SessionInfo,
	SessionManager,
} from "../core/session-manager/index.js";
export {
	FileSettingsStorage,
	InMemorySettingsStorage,
	type Settings,
	SettingsManager,
	type SettingsScope,
	type SettingsStorage,
} from "../core/settings-manager.js";
