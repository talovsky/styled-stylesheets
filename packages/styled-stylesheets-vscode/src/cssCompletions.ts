import {
	CompletionList,
	CompletionItem,
	CompletionItemKind,
	ExtensionContext,
	MarkdownString,
	Range,
	SnippetString,
	TextEdit,
	languages
} from "vscode";
import {
	getCSSLanguageService,
	TextDocument as CSSTextDocument,
	CompletionItemKind as LSPKind
} from "vscode-css-languageservice";

import { documentSelector, findEnclosingStylesheetTemplate } from "./stylesheetTemplate";

// InsertTextFormat.Snippet = 2 (LSP spec)
const SNIPPET_FORMAT = 2;

const cssLS = getCSSLanguageService();

const HTML_TAGS = [
	"a",
	"article",
	"aside",
	"body",
	"button",
	"div",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"header",
	"img",
	"input",
	"label",
	"li",
	"main",
	"nav",
	"ol",
	"p",
	"section",
	"select",
	"span",
	"textarea",
	"ul"
];

// LSP CompletionItemKind is 1-indexed; VS Code's is 0-indexed.
function convertKind(kind: LSPKind | undefined): CompletionItemKind {
	return kind !== undefined ? ((kind - 1) as CompletionItemKind) : CompletionItemKind.Text;
}

function createRuleSnippet(label: string, insertText = label) {
	const item = new CompletionItem(label, CompletionItemKind.Snippet);
	item.insertText = new SnippetString(`${insertText} {\n\t$0\n}`);
	item.detail = "stylesheet selector";
	item.sortText = `!selector-${label}`;
	return item;
}

function createTemplateExpansionCompletion() {
	const item = new CompletionItem("expand stylesheet template", CompletionItemKind.Snippet);
	item.insertText = new SnippetString("\n\t$0\n");
	item.documentation = "Creates an indented stylesheet block.";
	item.sortText = "!!expand-stylesheet-template";
	return item;
}

function getSelectorCompletions(content: string, cssOffset: number) {
	if (!isSelectorContext(content, cssOffset)) return [];

	return [
		createRuleSnippet(".class-name", ".${1:class-name}"),
		createRuleSnippet("#id", "#${1:id}"),
		...HTML_TAGS.map(tag => createRuleSnippet(tag))
	];
}

function isSelectorContext(content: string, cssOffset: number) {
	const beforeCursor = content.slice(0, cssOffset);
	const stack: Array<"at-rule" | "rule"> = [];
	let fragmentStart = 0;

	for (let i = 0; i < beforeCursor.length; i += 1) {
		const char = beforeCursor[i];
		const next = beforeCursor[i + 1];

		if (char === "/" && next === "*") {
			const commentEnd = beforeCursor.indexOf("*/", i + 2);
			i = commentEnd === -1 ? beforeCursor.length : commentEnd + 1;
			continue;
		}

		if (char === '"' || char === "'") {
			const quote = char;
			i += 1;
			while (i < beforeCursor.length) {
				if (beforeCursor[i] === "\\" && i + 1 < beforeCursor.length) {
					i += 2;
					continue;
				}
				if (beforeCursor[i] === quote) break;
				i += 1;
			}
			continue;
		}

		if (char === "{") {
			const header = beforeCursor.slice(fragmentStart, i).trim();
			stack.push(header.startsWith("@") ? "at-rule" : "rule");
			fragmentStart = i + 1;
			continue;
		}

		if (char === "}") {
			stack.pop();
			fragmentStart = i + 1;
			continue;
		}

		if (char === ";") {
			fragmentStart = i + 1;
		}
	}

	const fragment = beforeCursor.slice(fragmentStart).trimStart();
	if (fragment.includes(":") || fragment.startsWith("@")) return false;

	return !stack.includes("rule");
}

export function registerCompletionProvider(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerCompletionItemProvider(
			documentSelector,
			{
				provideCompletionItems(document, position) {
					const cursorOffset = document.offsetAt(position);

					const template = findEnclosingStylesheetTemplate(document, position);
					if (!template) return null;

					const cssDoc = CSSTextDocument.create("untitled://embedded.css", "css", 1, template.content);
					const cssOffset = cursorOffset - template.contentStart;
					const cssPosition = cssDoc.positionAt(cssOffset);
					const stylesheet = cssLS.parseStylesheet(cssDoc);
					const result = cssLS.doComplete(cssDoc, cssPosition, stylesheet);
					const selectorCompletions = getSelectorCompletions(template.content, cssOffset);
					const nextCharacter = document.getText(new Range(position, position.translate(0, 1)));
					const templateExpansionCompletions =
						nextCharacter === "`" && template.content.trim().length === 0 ? [createTemplateExpansionCompletion()] : [];

					const items = result.items.map(lspItem => {
						const label = lspItem.label;

						const item = new CompletionItem(label, convertKind(lspItem.kind));

						item.detail = lspItem.detail;
						item.filterText = lspItem.filterText;
						item.sortText = lspItem.sortText;

						if (lspItem.documentation) {
							item.documentation =
								typeof lspItem.documentation === "string"
									? lspItem.documentation
									: new MarkdownString(lspItem.documentation.value);
						}

						const isSnippet = lspItem.insertTextFormat === SNIPPET_FORMAT;
						const isProperty = lspItem.kind === LSPKind.Property;

						if (lspItem.textEdit && "range" in lspItem.textEdit) {
							const { range, newText } = lspItem.textEdit;
							const startOff = cssDoc.offsetAt(range.start) + template.contentStart;
							const endOff = cssDoc.offsetAt(range.end) + template.contentStart;
							const vsRange = new Range(document.positionAt(startOff), document.positionAt(endOff));

							if (isProperty) {
								// Our insertColonOrSemiColon command handles `: ;` — just
								// insert the bare property name so it can detect it.
								item.textEdit = new TextEdit(vsRange, label);
							} else if (isSnippet) {
								item.insertText = new SnippetString(newText);
								item.textEdit = new TextEdit(vsRange, "");
							} else {
								item.textEdit = new TextEdit(vsRange, newText);
							}
						} else if (lspItem.insertText) {
							if (isProperty) {
								item.insertText = label;
							} else if (isSnippet) {
								item.insertText = new SnippetString(lspItem.insertText);
							} else {
								item.insertText = lspItem.insertText;
							}
						}

						return item;
					});

					return new CompletionList(
						[...templateExpansionCompletions, ...selectorCompletions, ...items],
						result.isIncomplete
					);
				}
			},
			"`",
			":",
			".",
			"#",
			"@",
			"-",
			"!"
		)
	);
}
