import { ExtensionContext, Hover, MarkdownString, Range, languages, type MarkedString } from "vscode";
import { getCSSLanguageService, TextDocument as CSSTextDocument } from "vscode-css-languageservice";

import { documentSelector, findEnclosingStylesheetTemplate } from "./stylesheetTemplate";

const cssLS = getCSSLanguageService();

export function registerHoverProvider(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerHoverProvider(documentSelector, {
			provideHover(document, position) {
				const cursorOffset = document.offsetAt(position);

				const template = findEnclosingStylesheetTemplate(document, position);
				if (!template) return null;

				const cssDoc = CSSTextDocument.create("untitled://embedded.css", "css", 1, template.content);
				const cssOffset = cursorOffset - template.contentStart;
				const cssPosition = cssDoc.positionAt(cssOffset);
				const stylesheet = cssLS.parseStylesheet(cssDoc);
				const result = cssLS.doHover(cssDoc, cssPosition, stylesheet);
				if (!result) return null;

				const range = result.range
					? new Range(
							document.positionAt(cssDoc.offsetAt(result.range.start) + template.contentStart),
							document.positionAt(cssDoc.offsetAt(result.range.end) + template.contentStart)
						)
					: undefined;

				return new Hover(toHoverContents(result.contents), range);
			}
		})
	);
}

function toHoverContents(contents: HoverContent | HoverContent[]) {
	if (Array.isArray(contents)) return contents.map(toHoverContent);
	return toHoverContent(contents);
}

function toHoverContent(content: HoverContent): MarkdownString | MarkedString {
	if (typeof content === "string") return content;
	if ("language" in content) return content;

	const markdown = new MarkdownString(content.value);
	markdown.supportHtml = true;
	return markdown;
}

type HoverContent =
	| string
	| MarkedString
	| {
			kind: string;
			value: string;
	  };
