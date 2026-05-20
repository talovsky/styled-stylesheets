import { ExtensionContext, Location, languages } from "vscode";

import {
	getClassesForReference,
	getStylesheetClassAtPosition,
	getStylesheetPropertyReference,
	getStylesheetPropertyReferences
} from "./stylesheetClasses";
import { documentSelector } from "./stylesheetTemplate";

export function registerClassNameDefinitionProvider(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerDefinitionProvider(documentSelector, {
			provideDefinition(document, position) {
				// JSX → CSS: styles.className → .className in stylesheet
				const propertyReference = getStylesheetPropertyReference(document, position);
				if (propertyReference) {
					const className = getClassesForReference(document, propertyReference.referenceName).find(
						item => item.property === propertyReference.propertyName
					);
					return className ? new Location(document.uri, className.range) : null;
				}

				// CSS → JSX: .className in stylesheet → styles.className usages
				const classReference = getStylesheetClassAtPosition(document, position);
				if (!classReference) return null;

				return getStylesheetPropertyReferences(
					document,
					classReference.referenceName,
					classReference.className.property
				).map(range => new Location(document.uri, range));
			}
		})
	);
}
