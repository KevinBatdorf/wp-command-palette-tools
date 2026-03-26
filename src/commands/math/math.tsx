import { registerPlugin } from "@wordpress/plugins";
import "../../editor.css";
import { NAMESPACE } from "../../constants";
import { useCommandLoader } from "../../lib/wordpress";
import { doBasicMath } from "./basic";

registerPlugin("wpcp-tools-math", {
	render: () => {
		useCommandLoader({
			name: `${NAMESPACE}/math`,
			hook: ({ search }: { search: string }) => doBasicMath(search),
		});
		return null;
	},
});
