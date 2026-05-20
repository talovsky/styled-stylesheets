import { ExtensionContext, Location, languages } from "vscode";

import {
	getClassReferencesForReference,
	getStylesheetPropertyReferences,
	getStylesheetSymbolAtPosition
} from "./stylesheetClasses";
import { documentSelector } from "./stylesheetTemplate";

export function registerClassNameReferenceProvider(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerReferenceProvider(documentSelector, {
			provideReferences(document, position, options) {
				const target = getStylesheetSymbolAtPosition(document, position);
				if (!target) return null;

				const cssRanges = getClassReferencesForReference(document, target.referenceName)
					.filter(item => item.original === target.className.original)
					.map(item => item.range);

				const jsxRanges = getStylesheetPropertyReferences(
					document,
					target.referenceName,
					target.className.property
				);

				const ranges = options.includeDeclaration ? [...cssRanges, ...jsxRanges] : jsxRanges;
				return ranges.map(range => new Location(document.uri, range));
			}
		})
	);
}
