import { Position, Range, TextDocument } from "vscode";

export const documentSelector = ["javascript", "typescript", "javascriptreact", "typescriptreact"];

export type StylesheetTemplate = {
	content: string;
	contentStart: number;
	contentEnd: number;
};

function isEscaped(text: string, index: number) {
	let backslashes = 0;
	for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) {
		backslashes += 1;
	}

	return backslashes % 2 === 1;
}

function hasUnescapedBacktick(text: string) {
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === "`" && !isEscaped(text, i)) return true;
	}

	return false;
}

export function findEnclosingStylesheetTemplate(document: TextDocument, position: Position): StylesheetTemplate | null {
	const text = document.getText();
	const cursorOffset = document.offsetAt(position);
	const beforeCursor = text.slice(0, cursorOffset);

	let contentStart = -1;
	const tagRe = /\bstylesheet(?:\s*<[^`>]*(?:>[^`<]*)?>)?\s*`/g;
	let match: RegExpExecArray | null;

	while ((match = tagRe.exec(beforeCursor)) !== null) {
		const start = match.index + match[0].length;
		if (!hasUnescapedBacktick(beforeCursor.slice(start))) {
			contentStart = start;
		}
	}

	if (contentStart === -1) return null;

	const afterCursor = text.slice(cursorOffset);
	for (let i = 0; i < afterCursor.length; i += 1) {
		if (afterCursor[i] === "`" && !isEscaped(afterCursor, i)) {
			const contentEnd = cursorOffset + i;
			return {
				content: text.slice(contentStart, contentEnd),
				contentStart,
				contentEnd
			};
		}
	}

	return null;
}

export function getTextBeforePosition(document: TextDocument, position: Position) {
	return document.getText(new Range(new Position(0, 0), position));
}
