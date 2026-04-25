import { Range, type Position, type TextDocument } from "vscode";

const STYLESHEET_DECLARATION_RE =
	/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*stylesheet(?:\s*<[^`>]*(?:>[^`<]*)?>)?\s*`([\s\S]*?)`/g;
const JS_IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/;
const JS_IDENTIFIER_PART_RE = /[A-Za-z0-9_$]/;
const JS_IDENTIFIER_BOUNDARY_RE = /[A-Za-z0-9_$]/;
const CSS_CLASS_START_RE = /[-_a-zA-Z]/;
const CSS_CLASS_PART_RE = /[-_a-zA-Z0-9]/;

export type StylesheetClass = {
	original: string;
	property: string;
	range: Range;
};

export type StylesheetClassReference = {
	referenceName: string;
	className: StylesheetClass;
};

export type StylesheetPropertyReference = {
	referenceName: string;
	propertyName: string;
	propertyRange: Range;
};

export function getStylesheetCompletionReference(document: TextDocument, position: Position) {
	const textBeforeCursor = document.getText().slice(0, document.offsetAt(position));
	const match = textBeforeCursor.match(/([A-Za-z_$][\w$]*)\.$/);
	return match?.[1] ?? null;
}

export function getStylesheetPropertyReference(
	document: TextDocument,
	position: Position
): StylesheetPropertyReference | null {
	const propertyRange = document.getWordRangeAtPosition(position, /[A-Za-z_$][\w$]*/);
	if (!propertyRange) return null;

	const propertyName = document.getText(propertyRange);
	const textBeforeProperty = document.getText().slice(0, document.offsetAt(propertyRange.start));
	const match = textBeforeProperty.match(/([A-Za-z_$][\w$]*)\.$/);
	if (!match) return null;

	return {
		referenceName: match[1],
		propertyName,
		propertyRange
	};
}

export function getClassesForReference(document: TextDocument, referenceName: string) {
	const text = document.getText();
	const classes = new Map<string, StylesheetClass>();
	let declaration: RegExpExecArray | null;

	STYLESHEET_DECLARATION_RE.lastIndex = 0;
	while ((declaration = STYLESHEET_DECLARATION_RE.exec(text)) !== null) {
		if (declaration[1] !== referenceName) continue;

		const css = declaration[2];
		const contentStart = declaration.index + declaration[0].indexOf("`") + 1;

		for (const className of findClassNames(document, css, contentStart)) {
			if (!JS_IDENTIFIER_RE.test(className.property) || classes.has(className.property)) continue;
			classes.set(className.property, className);
		}
	}

	return [...classes.values()];
}

export function getClassReferencesForReference(document: TextDocument, referenceName: string) {
	return getStylesheetDeclarations(document)
		.filter(declaration => declaration.referenceName === referenceName)
		.flatMap(declaration => findClassNames(document, declaration.css, declaration.contentStart));
}

export function getStylesheetClassAtPosition(
	document: TextDocument,
	position: Position
): StylesheetClassReference | null {
	for (const declaration of getStylesheetDeclarations(document)) {
		for (const className of findClassNames(document, declaration.css, declaration.contentStart)) {
			if (className.range.contains(position)) {
				return {
					referenceName: declaration.referenceName,
					className
				};
			}
		}
	}

	return null;
}

export function getStylesheetPropertyReferences(document: TextDocument, referenceName: string, propertyName: string) {
	const text = document.getText();
	const ranges: Range[] = [];
	const reference = escapeRegExp(referenceName);
	const property = escapeRegExp(propertyName);
	const propertyReferenceRe = new RegExp(`${reference}\\s*\\.\\s*(${property})(?![A-Za-z0-9_$])`, "g");
	let match: RegExpExecArray | null;

	while ((match = propertyReferenceRe.exec(text)) !== null) {
		const previousChar = text[match.index - 1];
		if (JS_IDENTIFIER_BOUNDARY_RE.test(previousChar ?? "")) continue;

		const propertyStart = match.index + match[0].lastIndexOf(match[1]);
		ranges.push(new Range(document.positionAt(propertyStart), document.positionAt(propertyStart + match[1].length)));
	}

	return ranges;
}

type StylesheetDeclaration = {
	referenceName: string;
	css: string;
	contentStart: number;
};

function getStylesheetDeclarations(document: TextDocument) {
	const text = document.getText();
	const declarations: StylesheetDeclaration[] = [];
	let declaration: RegExpExecArray | null;

	STYLESHEET_DECLARATION_RE.lastIndex = 0;
	while ((declaration = STYLESHEET_DECLARATION_RE.exec(text)) !== null) {
		declarations.push({
			referenceName: declaration[1],
			css: declaration[2],
			contentStart: declaration.index + declaration[0].indexOf("`") + 1
		});
	}

	return declarations;
}

function findClassNames(document: TextDocument, css: string, contentStart: number) {
	const classes: StylesheetClass[] = [];
	let quote: '"' | "'" | null = null;
	let inBlockComment = false;

	for (let i = 0; i < css.length; i += 1) {
		const char = css[i];
		const next = css[i + 1];

		if (inBlockComment) {
			if (char === "*" && next === "/") {
				i += 1;
				inBlockComment = false;
			}
			continue;
		}

		if (quote) {
			if (char === "\\" && i + 1 < css.length) {
				i += 1;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}

		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}

		if (char === "/" && next === "*") {
			inBlockComment = true;
			i += 1;
			continue;
		}

		if (char === "/" && next === "/" && css[i - 1] !== ":") {
			while (i < css.length && css[i] !== "\n" && css[i] !== "\r") i += 1;
			continue;
		}

		if (char !== "." || !isClassStart(next)) continue;

		let end = i + 2;
		while (end < css.length && CSS_CLASS_PART_RE.test(css[end])) end += 1;

		const original = css.slice(i + 1, end);
		const property = toCamelCase(original);
		const startOffset = contentStart + i + 1;
		const endOffset = contentStart + end;

		classes.push({
			original,
			property,
			range: new Range(document.positionAt(startOffset), document.positionAt(endOffset))
		});

		i = end - 1;
	}

	return classes;
}

function isClassStart(char: string | undefined) {
	if (!char) return false;
	if (char === "-") return true;
	return CSS_CLASS_START_RE.test(char);
}

export function toCamelCase(className: string) {
	return className.replace(/-+([a-zA-Z0-9_$])/g, (_, char: string) => char.toUpperCase());
}

export function toKebabCase(propertyName: string) {
	return propertyName
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/([a-zA-Z])(\d+)/g, "$1-$2")
		.replace(/(\d+)([a-zA-Z])/g, "$1-$2")
		.toLowerCase();
}

export function isValidClassName(className: string) {
	if (!isClassStart(className[0])) return false;
	return [...className.slice(1)].every(char => CSS_CLASS_PART_RE.test(char));
}

export function isValidPropertyName(propertyName: string) {
	return JS_IDENTIFIER_RE.test(propertyName);
}

export function isIdentifierPart(char: string | undefined) {
	return char ? JS_IDENTIFIER_PART_RE.test(char) : false;
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
