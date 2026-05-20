import {
	ExtensionContext,
	languages,
	Position,
	Range,
	TextEdit,
	type FormattingOptions,
	type TextDocument
} from "vscode";
import {
	getCSSLanguageService,
	TextDocument as CSSTextDocument,
	type Position as LSPPosition,
	type TextEdit as LSPTextEdit
} from "vscode-css-languageservice";

import { documentSelector, findEnclosingStylesheetTemplate, findStylesheetTemplates, type StylesheetTemplate } from "./stylesheetTemplate";

const cssLS = getCSSLanguageService();

export function registerFormattingProvider(context: ExtensionContext) {
	const provider = {
		provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions) {
			return findStylesheetTemplates(document).flatMap((template) => formatTemplate(document, template, options));
		},

		provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions) {
			const template = findEnclosingStylesheetTemplate(document, range.start);
			if (!template || !templateContainsRange(document, template, range)) return [];

			return formatTemplate(document, template, options, range);
		}
	};

	context.subscriptions.push(
		languages.registerDocumentFormattingEditProvider(documentSelector, provider),
		languages.registerDocumentRangeFormattingEditProvider(documentSelector, provider)
	);
}

function formatTemplate(document: TextDocument, template: StylesheetTemplate, options: FormattingOptions, range?: Range) {
	if (!range) return [formatWholeTemplate(document, template, options)];

	const cssDoc = CSSTextDocument.create(`${document.uri.toString()}.embedded.css`, "css", document.version, template.content);
	const cssRange = range ? toCssRange(document, template, range) : undefined;

	return cssLS
		.format(cssDoc, cssRange, {
			tabSize: options.tabSize,
			insertSpaces: options.insertSpaces
		})
		.map((edit) => toHostEdit(document, template, edit));
}

function formatWholeTemplate(document: TextDocument, template: StylesheetTemplate, options: FormattingOptions) {
	const css = template.content.trim();
	const cssDoc = CSSTextDocument.create(`${document.uri.toString()}.embedded.css`, "css", document.version, css);
	const formatted = applyTextEdits(
		css,
		cssLS.format(cssDoc, undefined, {
			tabSize: options.tabSize,
			insertSpaces: options.insertSpaces
		})
	).trim();
	const indent = getLineIndent(document, document.positionAt(template.contentStart).line);
	const indentedCss = formatted
		.split(/\r?\n/)
		.map((line) => (line.length > 0 ? `${indent}${line}` : line))
		.join("\n");

	return new TextEdit(
		new Range(document.positionAt(template.contentStart), document.positionAt(template.contentEnd)),
		`\n${indentedCss}\n${indent}`
	);
}

function templateContainsRange(document: TextDocument, template: StylesheetTemplate, range: Range) {
	const start = document.offsetAt(range.start);
	const end = document.offsetAt(range.end);

	return template.contentStart <= start && end <= template.contentEnd;
}

function toCssRange(document: TextDocument, template: StylesheetTemplate, range: Range) {
	const start = Math.max(0, document.offsetAt(range.start) - template.contentStart);
	const end = Math.min(template.content.length, document.offsetAt(range.end) - template.contentStart);
	const cssDoc = CSSTextDocument.create(`${document.uri.toString()}.embedded.css`, "css", document.version, template.content);

	return {
		start: cssDoc.positionAt(start),
		end: cssDoc.positionAt(end)
	};
}

function toHostEdit(document: TextDocument, template: StylesheetTemplate, edit: LSPTextEdit) {
	const start = document.positionAt(template.contentStart + offsetAt(template.content, edit.range.start.line, edit.range.start.character));
	const end = document.positionAt(template.contentStart + offsetAt(template.content, edit.range.end.line, edit.range.end.character));

	return new TextEdit(new Range(start, end), edit.newText);
}

function getLineIndent(document: TextDocument, line: number) {
	const text = document.lineAt(line).text;
	const match = text.match(/^\s*/);

	return match ? match[0] : "";
}

function applyTextEdits(text: string, edits: LSPTextEdit[]) {
	return edits
		.slice()
		.sort((a, b) => offsetAt(text, b.range.start) - offsetAt(text, a.range.start))
		.reduce((current, edit) => {
			const start = offsetAt(current, edit.range.start);
			const end = offsetAt(current, edit.range.end);

			return `${current.slice(0, start)}${edit.newText}${current.slice(end)}`;
		}, text);
}

function offsetAt(text: string, position: LSPPosition): number;
function offsetAt(text: string, line: number, character: number): number;
function offsetAt(text: string, lineOrPosition: number | LSPPosition, character?: number) {
	const line = typeof lineOrPosition === "number" ? lineOrPosition : lineOrPosition.line;
	const targetCharacter = typeof lineOrPosition === "number" ? character ?? 0 : lineOrPosition.character;
	let offset = 0;
	let currentLine = 0;

	while (currentLine < line && offset < text.length) {
		const nextLine = text.indexOf("\n", offset);
		if (nextLine === -1) return text.length;
		offset = nextLine + 1;
		currentLine += 1;
	}

	return Math.min(offset + targetCharacter, text.length);
}
