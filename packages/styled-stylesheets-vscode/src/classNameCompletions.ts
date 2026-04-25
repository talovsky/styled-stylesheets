import { CompletionItem, CompletionItemKind, ExtensionContext, MarkdownString, languages } from "vscode";

import { getClassesForReference, getStylesheetCompletionReference, type StylesheetClass } from "./stylesheetClasses";
import { documentSelector } from "./stylesheetTemplate";

function createClassCompletion(className: StylesheetClass) {
	const item = new CompletionItem(className.property, CompletionItemKind.Property);
	item.detail = `.${className.original}`;
	item.documentation = new MarkdownString(`CSS class \`.${className.original}\``);
	item.sortText = className.property;
	return item;
}

export function registerClassNameCompletionProvider(context: ExtensionContext) {
	context.subscriptions.push(
		languages.registerCompletionItemProvider(
			documentSelector,
			{
				provideCompletionItems(document, position) {
					const referenceName = getStylesheetCompletionReference(document, position);
					if (!referenceName) return null;

					const classes = getClassesForReference(document, referenceName);
					if (classes.length === 0) return null;

					return classes.map(createClassCompletion);
				}
			},
			"."
		)
	);
}
