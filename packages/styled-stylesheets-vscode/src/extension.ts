import { type ExtensionContext } from "vscode";

import { registerClassNameCompletionProvider } from "./classNameCompletions";
import { registerClassNameDefinitionProvider } from "./classNameDefinitions";
import { registerClassNameRenameProvider } from "./classNameRenames";
import { registerCompletionProvider } from "./cssCompletions";
import { registerHoverProvider } from "./cssHovers";
import { enterKeyEvent, stylesheetEnterKeyEvent } from "./insertColonCommand";

export function activate(context: ExtensionContext) {
	registerCompletionProvider(context);
	registerHoverProvider(context);
	registerClassNameCompletionProvider(context);
	registerClassNameDefinitionProvider(context);
	registerClassNameRenameProvider(context);
	context.subscriptions.push(enterKeyEvent);
	context.subscriptions.push(stylesheetEnterKeyEvent);
}
