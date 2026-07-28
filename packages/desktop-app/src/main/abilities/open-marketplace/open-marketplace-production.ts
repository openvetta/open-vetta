import { join } from "node:path";
import { getVettaHomePath } from "@vetta/action-rpc";
import type { GitHubMarketplaceOrigin } from "../../../preload/api-types/abilities.js";
import {
	getSkillBaseDir,
	readSkillsManifest,
	recordSkillResourceEvent,
	writeSkillsManifest,
} from "../../skills/skill-service.js";
import { recordAbilityInstall } from "../ability-ledger.js";
import type { MarketplaceAbilityManifest } from "./marketplace-schema.js";
import {
	installOpenMarketplaceAbility,
	type OpenMarketplaceInstallerDependencies,
} from "./open-marketplace-installer.js";

const dependencies: OpenMarketplaceInstallerDependencies = {
	getBaseDir: getSkillBaseDir,
	tmpBaseDir: join(getVettaHomePath(), "tmp"),
	readManifest: readSkillsManifest,
	writeManifest: writeSkillsManifest,
	recordInstall: (type, slug, version, metadata) => recordAbilityInstall(type, slug, version, metadata),
	recordEvent: recordSkillResourceEvent,
};

export async function installOpenMarketplaceAbilityInDesktop(
	snapshotRoot: string,
	ability: MarketplaceAbilityManifest,
	origin: GitHubMarketplaceOrigin,
): Promise<void> {
	await installOpenMarketplaceAbility(snapshotRoot, ability, origin, dependencies);
}
