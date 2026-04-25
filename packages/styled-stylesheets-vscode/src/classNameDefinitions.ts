import { ExtensionContext, Location, languages } from "vscode";

import { getClassesForReference, getStylesheetPropertyReference } from "./stylesheetClasses";
import { documentSelector } from "./stylesheetTemplate";

export function registerClassNameDefinitionProvider(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerDefinitionProvider(documentSelector, {
			provideDefinition(document, position) {
				const reference = getStylesheetPropertyReference(document, position);
				if (!reference) return null;

				const className = getClassesForReference(document, reference.referenceName).find(
					item => item.property === reference.propertyName
				);
				if (!className) return null;

				return new Location(document.uri, className.range);
			}
		})
	);
}
