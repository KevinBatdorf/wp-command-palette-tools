import { useEffect, useState } from "@wordpress/element";
import { __ } from "@wordpress/i18n";
import copy from "copy-to-clipboard";
import { NAMESPACE } from "../../constants";
import { fireNotice } from "../../lib/wordpress";
import { evaluateExpression, formatResult } from "./evaluate";
import { calc } from "./icons";

export const doBasicMath = (search: string) => {
	const [isLoading, setIsLoading] = useState(true);
	const [output, setOutput] = useState<string>();

	useEffect(() => {
		setIsLoading(true);
		if (!search) return;
		const result = evaluateExpression(search);
		setOutput(result === undefined ? undefined : formatResult(result));
		setIsLoading(false);
	}, [search]);

	if (!output) return null;
	if (output === search) return null;
	return {
		isLoading,
		commands: [
			{
				name: `${NAMESPACE}/math/basic`,
				label: `${search} = ${output}`,
				icon: calc,
				callback: ({ close }: { close: () => void }) => {
					copy(output);
					fireNotice(__("Copied to clipboard!", "wpcp-tools"));
					close();
				},
			},
		],
	};
};
