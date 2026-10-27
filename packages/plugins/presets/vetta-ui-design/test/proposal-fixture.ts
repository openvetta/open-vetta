/** agent 自拟 App 方向的样例：三案彼此拉开、避开默认值，校验能直接通过。 */
import { type AppInput, type Dealer, seededRandom } from "../src/direction/deal";
import type { Preference, StatedIntent } from "../src/direction/intent";
import type { TasteLibrary } from "../src/direction/library";
import { choose, chosenProposal, propose, startProposal } from "../src/direction/record";

export const OBVIOUS =
	"White cards on a light grey ground, a mid blue accent, Inter everywhere, a balance card on top and a list of rows under it.";

export type Raw = Record<string, unknown>;

export const option = (overrides: Raw = {}): Raw => ({
	id: "roast-ledger",
	name: "Roast ledger",
	idea: "On these screens, the roast date printed on every bag becomes the ordering spine of the menu.",
	departs: "Paper ground and a serif instead of white cards and Inter, because the shop sells by roast.",
	theme: "light",
	colours: { ground: "#f4efe6", panel: "#e9e1d3", text: "#1d1a16", muted: "#5d554b", accent: "#9c3d1c" },
	type: { display: "Fraunces", text: "Figtree", class: "serif-display" },
	layout: "The roast-date strip is the largest thing on the first screen; the order sheet slides up from the bottom.",
	...overrides,
});

export const night = (overrides: Raw = {}): Raw =>
	option({
		id: "night-counter",
		name: "Night counter",
		theme: "dark",
		colours: { ground: "#0e0e0c", panel: "#1b1a17", text: "#f3efe7", muted: "#a59f94", accent: "#d9a441" },
		type: { display: "Big Shoulders Display", text: "Public Sans", class: "condensed-heavy" },
		...overrides,
	});

export const loud = (overrides: Raw = {}): Raw =>
	option({
		id: "tamper-green",
		name: "Tamper green",
		colours: { ground: "#ffffff", panel: "#eef3ee", text: "#111611", muted: "#55605a", accent: "#1f6b3a" },
		type: { display: "Bricolage Grotesque", text: "Bricolage Grotesque", class: "grotesk-tight" },
		...overrides,
	});

const NOW = "2026-10-27T00:00:00.000Z";
const dealer: Dealer = { lib: {} as TasteLibrary, rnd: seededRandom(1), history: [] };

/** 提案、（按需）答完气质题、选定，得到一份选定了某一案的 App 记录。 */
export function chosenApp(input: AppInput, id = "roast-ledger", stated: StatedIntent = {}, preferences: Preference[] = []) {
	const waiting = startProposal(input, 1, NOW, stated);
	const proposed = propose(waiting, [option(), night(), loud()], OBVIOUS, [], NOW, "");
	const record = choose(dealer, proposed.record, id, NOW, undefined, preferences);
	const proposal = chosenProposal(record);
	if (!proposal) throw new Error(`no proposal ${id}`);
	return { record, proposal };
}
