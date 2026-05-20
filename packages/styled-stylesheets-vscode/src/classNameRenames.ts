import { ExtensionContext, Range, WorkspaceEdit, languages, type Position, type TextDocument } from "vscode";

import {
	getClassReferencesForReference,
	getStylesheetPropertyReference,
	getStylesheetPropertyReferences,
	getStylesheetSymbolAtPosition,
	isValidClassName,
	isValidPropertyName,
	toCamelCase,
	toKebabCase,
	type StylesheetClassReference
} from "./stylesheetClasses";
import { documentSelector } from "./stylesheetTemplate";

type ClassRenameTarget = StylesheetClassReference & {
	onProperty: boolean;
	renameRange: Range;
};

type NormalizedRename = {
	cssName: string;
	propertyName: string;
};

export function registerClassNameRenameProvider(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerRenameProvider(documentSelector, {
			prepareRename(document, position) {
				const target = getRenameTarget(document, position);
				if (!target) return null;

				return {
					range: target.renameRange,
					placeholder: target.onProperty ? target.className.property : target.className.original
				};
			},

			provideRenameEdits(document, position, newName) {
				const target = getRenameTarget(document, position);
				if (!target) return null;

				const rename = normalizeRename(newName, target.className.original);
				if (!rename) return null;

				const edit = new WorkspaceEdit();

				for (const className of getClassReferencesForReference(document, target.referenceName)) {
					if (className.original === target.className.original) {
						edit.replace(document.uri, className.range, rename.cssName);
					}
				}

				for (const range of getStylesheetPropertyReferences(
					document,
					target.referenceName,
					target.className.property
				)) {
					edit.replace(document.uri, range, rename.propertyName);
				}

				return edit;
			}
		})
	);
}

function getRenameTarget(document: TextDocument, position: Position): ClassRenameTarget | null {
	const propertyReference = getStylesheetPropertyReference(document, position);
	const target = getStylesheetSymbolAtPosition(document, position);
	if (!target) return null;

	return {
		...target,
		onProperty: propertyReference != null,
		renameRange: propertyReference?.propertyRange ?? target.className.range
	};
}

function normalizeRename(newName: string, previousCssName: string): NormalizedRename | null {
	const trimmedName = newName.trim().replace(/^\./, "");
	if (trimmedName.length === 0) return null;

	if (trimmedName.includes("-")) {
		const propertyName = toCamelCase(trimmedName);
		if (!isValidClassName(trimmedName) || !isValidPropertyName(propertyName)) return null;

		return {
			cssName: trimmedName,
			propertyName
		};
	}

	if (!isValidPropertyName(trimmedName)) return null;

	const cssName = previousCssName.includes("-") ? toKebabCase(trimmedName) : trimmedName;
	if (!isValidClassName(cssName)) return null;

	return {
		cssName,
		propertyName: trimmedName
	};
}
