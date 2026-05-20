import { type ExtensionContext } from "vscode";

import { registerClassNameCompletionProvider } from "./classNameCompletions";
import { registerClassNameDefinitionProvider } from "./classNameDefinitions";
import { registerClassNameReferenceProvider } from "./classNameReferences";
import { registerClassNameRenameProvider } from "./classNameRenames";
import { registerCompletionProvider } from "./cssCompletions";
import { registerFormattingProvider } from "./cssFormatting";
import { registerHoverProvider } from "./cssHovers";
import { enterKeyEvent, stylesheetEnterKeyEvent } from "./insertColonCommand";

export function activate(context: ExtensionContext) {
	registerCompletionProvider(context);
	registerHoverProvider(context);
	registerFormattingProvider(context);
	registerClassNameCompletionProvider(context);
	registerClassNameDefinitionProvider(context);
	registerClassNameReferenceProvider(context);
	registerClassNameRenameProvider(context);
	context.subscriptions.push(enterKeyEvent, stylesheetEnterKeyEvent);
}
