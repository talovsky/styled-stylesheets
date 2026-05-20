import { type Position, type TextDocument } from "vscode";

export const documentSelector = ["javascript", "typescript", "javascriptreact", "typescriptreact"];

export type StylesheetTemplate = {
	bindingName: string | null;
	content: string;
	contentStart: number;
	contentEnd: number;
};

export function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findEnclosingStylesheetTemplate(document: TextDocument, position: Position): StylesheetTemplate | null {
	const cursorOffset = document.offsetAt(position);
	return findStylesheetTemplates(document).find(
		template => template.contentStart <= cursorOffset && cursorOffset <= template.contentEnd
	) ?? null;
}

export function findStylesheetTemplates(document: TextDocument): StylesheetTemplate[] {
	const text = document.getText();
	const tagNames = getStyledStylesheetTagNames(text);
	if (tagNames.size === 0) return [];

	const templates: StylesheetTemplate[] = [];
	const tagPattern = [...tagNames].map(escapeRegExp).join("|");
	const tagRe = new RegExp(
		"(?:\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*)?\\b(?:" +
			tagPattern +
			")(?:\\s*<[^`>]*(?:>[^`<]*)?>)?\\s*`",
		"g"
	);
	let match: RegExpExecArray | null;

	while ((match = tagRe.exec(text)) !== null) {
		const contentStart = match.index + match[0].length;
		const contentEnd = findClosingBacktick(text, contentStart);

		if (contentEnd === -1) break;
		if (!hasUnescapedBacktick(text.slice(contentStart, contentEnd))) {
			templates.push({
				bindingName: match[1] ?? null,
				content: text.slice(contentStart, contentEnd),
				contentStart,
				contentEnd
			});
		}

		tagRe.lastIndex = contentEnd + 1;
	}

	return templates;
}

export function getStyledStylesheetTagNames(text: string) {
	const tagNames = new Set<string>();
	const importRe =
		/import\s+(?:(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^}]*)\}|([A-Za-z_$][\w$]*))\s+from\s+["']styled-stylesheets["']/g;
	let match: RegExpExecArray | null;

	while ((match = importRe.exec(text)) !== null) {
		if (match[1]) tagNames.add(match[1]);
		if (match[3]) tagNames.add(match[3]);

		const namedImports = match[2];
		if (!namedImports) continue;

		for (const part of namedImports.split(",")) {
			const namedMatch = part.trim().match(/^(stylesheet|css)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
			if (namedMatch) tagNames.add(namedMatch[2] ?? namedMatch[1]);
		}
	}

	return tagNames;
}

function isEscaped(text: string, index: number) {
	let backslashes = 0;
	for (let i = index - 1; i >= 0 && text[i] === "\\"; i -= 1) {
		backslashes += 1;
	}

	return backslashes % 2 === 1;
}

function findClosingBacktick(text: string, start: number) {
	for (let i = start; i < text.length; i += 1) {
		if (text[i] === "`" && !isEscaped(text, i)) return i;
	}
	return -1;
}

function hasUnescapedBacktick(text: string) {
	for (let i = 0; i < text.length; i += 1) {
		if (text[i] === "`" && !isEscaped(text, i)) return true;
	}
	return false;
}
