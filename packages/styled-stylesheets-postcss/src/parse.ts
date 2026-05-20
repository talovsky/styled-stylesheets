import postcss, { type ChildNode, type Position, type ProcessOptions, type Root } from "postcss";
import * as ts from "typescript";

export type StylesheetNode = {
	css: string;
	rangeStart: number;
	rangeEnd: number;
	interpolationStart?: number;
	locationStart: {
		line: number;
		column: number;
	};
};

type SourcePosition = {
	offset: number;
	line: number;
	column: number;
};

type CssSyntaxErrorLike = Error & {
	line?: number;
	column?: number;
	endLine?: number;
	endColumn?: number;
	input?: {
		source?: {
			offset?: number;
		};
	};
};

const parse: postcss.Parser<postcss.Document> = (css, opts) => {
	const inputCode = typeof css === "string" ? css : css.toString();
	const options = opts ?? {};
	if (isCssFile(options.from)) return postcss.parse(inputCode, options) as unknown as postcss.Document;

	const input = new postcss.Input(inputCode, options);

	const document = new postcss.Document({
		source: {
			input,
			start: { offset: 0, line: 1, column: 1 }
		}
	});

	const foundNodes = parseStylesheetTemplates(inputCode, options);
	let previousRangeEnd = 0;

	for (const [index, node] of foundNodes.entries()) {
		if (node.interpolationStart !== undefined) {
			throw input.error(
				"[styled-stylesheets] stylesheet tag does not support interpolations.",
				node.interpolationStart
			);
		}

		const root = parseStylesheetCss(node.css, node, options);

		root.raws.isRuleLike = true;
		root.raws.styledSyntaxIsComponent = true;
		root.raws.styledSyntaxRangeStart = node.rangeStart;
		root.raws.styledSyntaxRangeEnd = node.rangeEnd;
		root.raws.codeBefore = inputCode.slice(previousRangeEnd, node.rangeStart);

		if (index === foundNodes.length - 1) {
			root.raws.codeAfter = inputCode.slice(node.rangeEnd);
		}

		previousRangeEnd = node.rangeEnd;
		document.append(root);
	}

	return document;
};

function isCssFile(fileName?: string): boolean {
	return fileName !== undefined && /\.css$/i.test(fileName);
}

function parseStylesheetCss(css: string, node: StylesheetNode, options: ProcessOptions): Root {
	try {
		const root = postcss.parse(css, options);
		const locationStart = node.locationStart;

		root.source = {
			input: new postcss.Input(css, options),
			start: {
				offset: node.rangeStart,
				line: locationStart.line,
				column: locationStart.column
			}
		};

		root.walk((child: ChildNode) => {
			if (!child.source) return;
			if (child.source.start) child.source.start = fixPosition(child.source.start, node);
			if (child.source.end) child.source.end = fixPosition(child.source.end, node);
		});

		return root;
	} catch (error) {
		throw fixErrorPosition(error, node);
	}
}

function fixPosition(position: Position, node: StylesheetNode): Position {
	const line = node.locationStart.line + position.line - 1;
	const column = position.line === 1 ? node.locationStart.column + position.column - 1 : position.column;

	return {
		offset: node.rangeStart + position.offset,
		line,
		column
	};
}

function fixErrorPosition(error: unknown, node: StylesheetNode): unknown {
	if (!(error instanceof Error) || error.name !== "CssSyntaxError") return error;

	const syntaxError = error as CssSyntaxErrorLike;

	if (syntaxError.line) {
		const fixedStart = fixPosition(
			{ offset: syntaxError.input?.source?.offset ?? 0, line: syntaxError.line, column: syntaxError.column ?? 1 },
			node
		);
		syntaxError.line = fixedStart.line;
		syntaxError.column = fixedStart.column;
	}

	if (syntaxError.endLine) {
		const fixedEnd = fixPosition({ offset: 0, line: syntaxError.endLine, column: syntaxError.endColumn ?? 1 }, node);
		syntaxError.endLine = fixedEnd.line;
		syntaxError.endColumn = fixedEnd.column;
	}

	if (syntaxError.message && syntaxError.line && syntaxError.column) {
		syntaxError.message = syntaxError.message.replace(/:\d+:\d+:/, `:${syntaxError.line}:${syntaxError.column}:`);
	}

	return syntaxError;
}

function parseStylesheetTemplates(inputCode: string, options: ProcessOptions): StylesheetNode[] {
	const foundNodes: StylesheetNode[] = [];

	try {
		const sourceFile = ts.createSourceFile(
			options.from || "unnamed.tsx",
			inputCode,
			ts.ScriptTarget.Latest,
			true,
			scriptKindFor(options.from)
		);

		// TypeScript reports broken host syntax better than a CSS parser can.
		const diagnosticsSourceFile = sourceFile as ts.SourceFile & { parseDiagnostics?: unknown[] };
		if ((diagnosticsSourceFile.parseDiagnostics?.length ?? 0) > 0) return foundNodes;

		const localNames = collectStylesheetLocalNames(sourceFile);
		if (localNames.size === 0) localNames.add("stylesheet");

		function visit(node: ts.Node): void {
			if (ts.isTaggedTemplateExpression(node) && isStylesheetTag(node.tag, localNames)) {
				foundNodes.push(getStylesheetNode(node.template, inputCode, sourceFile));
			}

			ts.forEachChild(node, visit);
		}

		visit(sourceFile);
	} catch {
		// JavaScript/TypeScript syntax errors are outside this PostCSS syntax's job.
	}

	return foundNodes;
}

function collectStylesheetLocalNames(sourceFile: ts.SourceFile): Set<string> {
	const localNames = new Set<string>();

	for (const node of sourceFile.statements) {
		if (!ts.isImportDeclaration(node)) continue;
		if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== "styled-stylesheets") continue;

		if (node.importClause?.name) localNames.add(node.importClause.name.text);

		const namedBindings = node.importClause?.namedBindings;
		if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

		for (const specifier of namedBindings.elements) {
			if (specifier.isTypeOnly) continue;

			const imported = (specifier.propertyName ?? specifier.name).text;
			if (imported === "stylesheet" || imported === "css") {
				localNames.add(specifier.name.text);
			}
		}
	}

	return localNames;
}

function getStylesheetNode(
	template: ts.NoSubstitutionTemplateLiteral | ts.TemplateExpression,
	inputCode: string,
	sourceFile: ts.SourceFile
): StylesheetNode {
	const rangeStart = template.getStart(sourceFile) + 1;
	const rangeEnd = template.getEnd() - 1;
	const position = ts.getLineAndCharacterOfPosition(sourceFile, rangeStart);
	const node: StylesheetNode = {
		css: inputCode.slice(rangeStart, rangeEnd),
		rangeStart,
		rangeEnd,
		locationStart: {
			line: position.line + 1,
			column: position.character + 1
		}
	};

	if (ts.isTemplateExpression(template)) {
		node.interpolationStart = template.templateSpans[0].pos - 2;
	}

	return node;
}

function isStylesheetTag(tag: ts.LeftHandSideExpression, localNames: Set<string>): boolean {
	return ts.isIdentifier(tag) && localNames.has(tag.text);
}

function scriptKindFor(fileName?: string): ts.ScriptKind {
	if (!fileName) return ts.ScriptKind.TSX;
	if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (fileName.endsWith(".js") || fileName.endsWith(".mjs") || fileName.endsWith(".cjs")) {
		return ts.ScriptKind.JS;
	}
	return ts.ScriptKind.TS;
}

export default parse;
