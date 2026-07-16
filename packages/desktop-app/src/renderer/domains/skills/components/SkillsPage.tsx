import { useSkillsPageModel } from "../hooks/useSkillsPageModel";
import { SkillsPageView } from "./SkillsPageView";

export function SkillsPage(): JSX.Element {
	return <SkillsPageView model={useSkillsPageModel({ mode: "capability" })} />;
}
