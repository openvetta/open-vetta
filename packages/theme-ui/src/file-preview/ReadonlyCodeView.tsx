import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useRef, type JSX } from "react";
import { textCodeEditorTheme } from "./text-code-editor-theme";
import { getTextEditorLanguageExtension, normalizeFileExtension } from "./text-editor-language";

const fillPane = EditorView.theme({ "&": { height: "100%" } });

export interface ReadonlyCodeViewProps {
	content: string;
	extension: string;
}

/**
 * Read-only CodeMirror for sources too large to highlight whole. It lays out and
 * highlights only the visible lines, so opening a multi-megabyte file stays responsive.
 */
export function ReadonlyCodeView({ content, extension }: ReadonlyCodeViewProps): JSX.Element {
	const hostRef = useRef<HTMLDivElement>(null);
	const languageKey = normalizeFileExtension(extension);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const view = new EditorView({
			state: EditorState.create({
				doc: content,
				extensions: [
					basicSetup,
					EditorState.readOnly.of(true),
					EditorView.editable.of(false),
					getTextEditorLanguageExtension(languageKey),
					textCodeEditorTheme,
					// Fill the preview pane and scroll inside the editor, so long lines get their
					// own horizontal scrollbar instead of one at the bottom of the whole file.
					fillPane,
				],
			}),
			parent: host,
		});
		return () => view.destroy();
	}, [content, languageKey]);

	return <div ref={hostRef} className="h-full min-h-0 w-full bg-background" />;
}
