import type { MarkdownLabels } from "./rich-labels";
import { lazy, Suspense } from "react";
import { CodeBlock, DefaultCodeBlock } from "./CodeBlock";
import type { MarkdownCodeBlockProps } from "./definition";

const LazyMath = lazy(() => import("./MathFormula").then((module) => ({ default: module.MathFormula })));
const LazyRichCode = lazy(() => import("./RichCodeBlock").then((module) => ({ default: module.RichCodeBlock })));
const LazyMermaid = lazy(() => import("./MermaidBlock").then((module) => ({ default: module.MermaidBlock })));

export function Formula(props: { source: string; display: boolean; live?: boolean; labels?: MarkdownLabels }) {
	return (
		<Suspense fallback={<code>{props.source}</code>}>
			<LazyMath {...props} />
		</Suspense>
	);
}

export function BuiltinCodeBlock(props: MarkdownCodeBlockProps) {
	if (/^mermaid$/i.test(props.lang)) return <Suspense fallback={<DefaultCodeBlock {...props} live />}><LazyMermaid {...props} /></Suspense>;
	if (/^(?:html|svg)$/i.test(props.lang)) {
		return (
			<Suspense fallback={<DefaultCodeBlock {...props} live />}>
				<LazyRichCode {...props} />
			</Suspense>
		);
	}
	if (/^(?:math|latex|tex)$/i.test(props.lang))
		return (
			<CodeBlock.Root {...props}>
				<CodeBlock.Copy>
					<CodeBlock.Frame>
						{/* 公式块没有语言栏，内边距在这里补齐，保持与表格/代码正文同一左侧光学边线。 */}
						<CodeBlock.Body>
							<div className="py-3 pr-4 pl-5">
								<Formula source={props.code} display live={props.live} />
							</div>
						</CodeBlock.Body>
					</CodeBlock.Frame>
				</CodeBlock.Copy>
			</CodeBlock.Root>
		);
	return <DefaultCodeBlock {...props} />;
}
