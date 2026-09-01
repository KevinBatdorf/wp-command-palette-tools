import { registerPlugin } from "@wordpress/plugins";
import "../../editor.css";
import { NAMESPACE } from "../../constants";
import { mathTools } from "../../lib/tool-commands";
import { toEditorCommand, useCommandLoader } from "../../lib/wordpress";
import { calc } from "./icons";

// Module scope: core re-registers the loader whenever `hook` changes identity.
const loader = {
	name: `${NAMESPACE}/math`,
	hook: ({ search }: { search: string }) => {
		const commands = mathTools(search).map((tool) =>
			toEditorCommand(tool, calc),
		);
		return commands.length ? { commands, isLoading: false } : null;
	},
};

registerPlugin("wpcp-tools-math", {
	render: () => {
		useCommandLoader(loader);
		return null;
	},
});
