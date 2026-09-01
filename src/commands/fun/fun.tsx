import { registerPlugin } from "@wordpress/plugins";
import "../../editor.css";
import { funTools } from "../../lib/tool-commands";
import { toEditorCommand, useCommand } from "../../lib/wordpress";
import { confettiIcon } from "./icons";

// Module scope: core re-registers a command whose `keywords` array is new.
const [basic, delayed] = funTools().map((tool) =>
	toEditorCommand(tool, confettiIcon),
);

registerPlugin("wpcp-tools-fun", {
	render: () => {
		useCommand(basic);
		useCommand(delayed);
		return null;
	},
});
