import { registerPlugin } from "@wordpress/plugins";
import "../../editor.css";
import { NAMESPACE } from "../../constants";
import { colorTools } from "../../lib/tool-commands";
import { toEditorCommand, useCommandLoader } from "../../lib/wordpress";
import { colorIcon } from "./icons";

const loader = {
	name: `${NAMESPACE}/color`,
	hook: ({ search }: { search: string }) => {
		const commands = colorTools(search).map((tool) =>
			toEditorCommand(tool, colorIcon),
		);
		return commands.length ? { commands, isLoading: false } : null;
	},
};

registerPlugin("wpcp-tools-color", {
	render: () => {
		useCommandLoader(loader);
		return null;
	},
});
