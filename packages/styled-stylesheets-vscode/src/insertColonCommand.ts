import { commands, Position, Range, Selection, window } from "vscode";
import { getDefaultCSSDataProvider } from "vscode-css-languageservice";

import { normalizeRegex, patterns } from "./patterns";
import { findEnclosingStylesheetTemplate } from "./stylesheetTemplate";

const cssDataProvider = getDefaultCSSDataProvider();
const properties = cssDataProvider.provideProperties();

const cssFunctions = properties.reduce((acc, prop) => {
	prop.values?.forEach(v => {
		if (v.name.endsWith(")")) acc.add(v.name);
	});
	return acc;
}, new Set<string>());

export const enterKeyEvent = commands.registerCommand("extension.insertColonOrSemiColon", async () => {
	await commands.executeCommand("acceptSelectedSuggestion");
	const editor = window.activeTextEditor;
	if (!editor) return;

	const selection = editor.selection;
	const textBeforeCursor = editor.document.getText(new Range(new Position(0, 0), selection.active));

	const insideTemplate = patterns.some(pattern => {
		try {
			const re = new RegExp(`(${normalizeRegex(pattern.begin)})(?![\\S\\s]*(${normalizeRegex(pattern.end)}))`);
			return re.test(textBeforeCursor);
		} catch {
			return false;
		}
	});

	if (!insideTemplate) return;

	const lineText = editor.document.lineAt(selection.start.line).text;
	const lastWord = lineText.trim().split(" ").at(-1) ?? "";

	if (properties.some(p => p.name === lastWord)) {
		await editor.edit(edit => {
			edit.insert(editor.document.lineAt(selection.active).range.end, ": ;");
		});
		commands.executeCommand("cursorLeft");
		commands.executeCommand("editor.action.triggerSuggest");
		return;
	}

	if (cssFunctions.has(lastWord.slice(0, -1))) {
		commands.executeCommand("cursorLeft");
	}
});

function getIndentUnit() {
	const options = window.activeTextEditor?.options;
	if (options?.insertSpaces === false) return "\t";

	const tabSize = typeof options?.tabSize === "number" ? options.tabSize : 2;
	return " ".repeat(tabSize);
}

async function typeNewline() {
	await commands.executeCommand("type", { text: "\n" });
}

export const stylesheetEnterKeyEvent = commands.registerCommand("extension.insertStylesheetNewline", async () => {
	const editor = window.activeTextEditor;
	if (!editor) return;

	const { document, selection } = editor;
	const template = findEnclosingStylesheetTemplate(document, selection.active);

	if (!template || !selection.isEmpty) {
		await typeNewline();
		return;
	}

	const cursorOffset = document.offsetAt(selection.active);
	const isInsideEmptyTemplate =
		cursorOffset >= template.contentStart &&
		cursorOffset <= template.contentEnd &&
		template.content.trim().length === 0;

	if (!isInsideEmptyTemplate) {
		await typeNewline();
		return;
	}

	const lineText = document.lineAt(selection.active.line).text;
	const baseIndent = lineText.match(/^\s*/)?.[0] ?? "";
	const innerIndent = `${baseIndent}${getIndentUnit()}`;

	await editor.edit(edit => {
		edit.insert(selection.active, `\n${innerIndent}\n${baseIndent}`);
	});

	const nextPosition = new Position(selection.active.line + 1, innerIndent.length);
	editor.selection = new Selection(nextPosition, nextPosition);
});
