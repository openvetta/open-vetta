import type { PersonaOption } from "@preload/api.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

const MIN_IMAGES = 1;
const MAX_IMAGES = 10;

function clampImages(value: number): number {
	if (!Number.isFinite(value)) return 2;
	return Math.min(Math.max(Math.round(value), MIN_IMAGES), MAX_IMAGES);
}

export interface AgentSettingsModel {
	actions: {
		applyPersonalization: () => Promise<void>;
		commitMaxRecentImages: (value: number) => void;
		previewMaxRecentImages: (value: number) => void;
		setCustomPrompt: (value: string) => void;
		setPersonaId: (value: string) => void;
		toggleAgentSkills: (checked: boolean) => void;
		togglePromptPrediction: (checked: boolean) => void;
		toggleVettaCli: (checked: boolean) => void;
	};
	agentSkillsEnabled: boolean;
	customPrompt: string;
	dirty: boolean;
	justSaved: boolean;
	labels: AgentSettingsLabels;
	maxImages: number;
	maxRecentImages: number;
	minImages: number;
	personaId: string;
	personas: readonly PersonaOption[];
	promptPredictionEnabled: boolean;
	saving: boolean;
	selectedPersona?: PersonaOption;
	vettaCliEnabled: boolean;
}

interface AgentSettingsLabels {
	agentDescription: string;
	agentSkill: string;
	agentSkillDescription: string;
	appOp: string;
	appOpDescription: string;
	applied: string;
	apply: string;
	customInstructions: string;
	customInstructionsDescription: string;
	customInstructionsPlaceholder: string;
	defaultPersona: string;
	images: string;
	inputPrediction: string;
	inputPredictionDescription: string;
	maxRecentImages: string;
	maxRecentImagesDescription: string;
	persona: string;
	saving: string;
	sections: {
		experimental: string;
		images: string;
		personalization: string;
	};
	title: string;
}

export function useAgentSettingsModel(): AgentSettingsModel {
	const { t } = useTranslation("settings");
	const [maxRecentImages, setMaxRecentImages] = useState(2);
	const [personas, setPersonas] = useState<PersonaOption[]>([]);
	const [personaId, setPersonaId] = useState("default");
	const [customPrompt, setCustomPrompt] = useState("");
	const [applied, setApplied] = useState({ personaId: "default", customPrompt: "" });
	const [saving, setSaving] = useState(false);
	const [justSaved, setJustSaved] = useState(false);
	const [vettaCliEnabled, setVettaCliEnabled] = useState(true);
	const [promptPredictionEnabled, setPromptPredictionEnabled] = useState(false);
	const [agentSkillsEnabled, setAgentSkillsEnabled] = useState(true);

	useEffect(() => {
		void window.vetta.session.getMaxRecentImages().then((value) => setMaxRecentImages(clampImages(value)));
		void window.vetta.session.getPersonas().then(setPersonas);
		void window.vetta.session.getPersonalization().then((config) => {
			setPersonaId(config.personaId);
			setCustomPrompt(config.customPrompt);
			setApplied(config);
		});
		void window.vetta.config.get().then((config) => {
			setVettaCliEnabled(config.experimental?.vettaCli === true);
			setPromptPredictionEnabled(config.experimental?.promptPrediction === true);
			setAgentSkillsEnabled(config.experimental?.agentSkills !== false);
		});
	}, []);

	const toggleVettaCli = useCallback((checked: boolean) => {
		setVettaCliEnabled(checked);
		void window.vetta.config.set({ experimental: { vettaCli: checked } });
		recordSettingsUsage({ tab: "agent", action: checked ? "enabled" : "disabled", target: "vetta-cli" });
	}, []);

	const togglePromptPrediction = useCallback((checked: boolean) => {
		setPromptPredictionEnabled(checked);
		void window.vetta.config.set({ experimental: { promptPrediction: checked } });
		recordSettingsUsage({ tab: "agent", action: checked ? "enabled" : "disabled", target: "prompt-prediction" });
	}, []);

	const toggleAgentSkills = useCallback((checked: boolean) => {
		setAgentSkillsEnabled(checked);
		void window.vetta.config.set({ experimental: { agentSkills: checked } });
		recordSettingsUsage({ tab: "agent", action: checked ? "enabled" : "disabled", target: "agent-skills" });
	}, []);

	const dirty = personaId !== applied.personaId || customPrompt !== applied.customPrompt;
	const selectedPersona = personas.find((persona) => persona.id === personaId);

	const applyPersonalization = useCallback(async () => {
		setSaving(true);
		const startedAt = performance.now();
		try {
			const next = { personaId, customPrompt };
			await window.vetta.session.setPersonalization(next);
			setApplied(next);
			recordSettingsUsage({
				tab: "agent",
				action: "saved",
				target: customPrompt.trim() ? "personalization-custom" : "personalization",
			});
			const elapsed = performance.now() - startedAt;
			if (elapsed < 450) await new Promise((resolve) => setTimeout(resolve, 450 - elapsed));
			setJustSaved(true);
			setTimeout(() => setJustSaved(false), 1500);
		} finally {
			setSaving(false);
		}
	}, [customPrompt, personaId]);

	const previewMaxRecentImages = useCallback((value: number) => {
		setMaxRecentImages(clampImages(value));
	}, []);

	const commitMaxRecentImages = useCallback((value: number) => {
		const nextValue = clampImages(value);
		setMaxRecentImages(nextValue);
		void window.vetta.session.setMaxRecentImages(nextValue);
		recordSettingsUsage({ tab: "agent", action: "changed", target: "max-recent-images", value: String(nextValue) });
	}, []);

	const labels = useMemo<AgentSettingsLabels>(
		() => ({
			agentDescription: t("agentDescription"),
			agentSkill: t("agentSettings.agentSkill"),
			agentSkillDescription: t("agentSettings.agentSkillDesc"),
			appOp: t("agentSettings.appOp"),
			appOpDescription: t("agentSettings.appOpDesc"),
			applied: t("agentSettings.applied"),
			apply: t("agentSettings.apply"),
			customInstructions: t("agentSettings.customInstructions"),
			customInstructionsDescription: t("agentSettings.customInstructionsDesc"),
			customInstructionsPlaceholder: t("agentSettings.customInstructionsPlaceholder"),
			defaultPersona: t("agentSettings.default"),
			images: t("agentSettings.images"),
			inputPrediction: t("agentSettings.inputPrediction"),
			inputPredictionDescription: t("agentSettings.inputPredictionDesc"),
			maxRecentImages: t("agentSettings.maxRecentImages"),
			maxRecentImagesDescription: t("agentSettings.maxRecentImagesDesc"),
			persona: t("agentSettings.persona"),
			saving: t("agentSettings.saving"),
			sections: {
				experimental: t(SETTINGS_SECTION["agent-experimental"].titleKey),
				images: t(SETTINGS_SECTION["agent-images"].titleKey),
				personalization: t(SETTINGS_SECTION["agent-personalization"].titleKey),
			},
			title: t("agentSettings.title"),
		}),
		[t],
	);

	return {
		actions: {
			applyPersonalization,
			commitMaxRecentImages,
			previewMaxRecentImages,
			setCustomPrompt,
			setPersonaId,
			toggleAgentSkills,
			togglePromptPrediction,
			toggleVettaCli,
		},
		agentSkillsEnabled,
		customPrompt,
		dirty,
		justSaved,
		labels,
		maxImages: MAX_IMAGES,
		maxRecentImages,
		minImages: MIN_IMAGES,
		personaId,
		personas,
		promptPredictionEnabled,
		saving,
		selectedPersona,
		vettaCliEnabled,
	};
}
