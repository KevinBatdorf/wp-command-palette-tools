import { SnackbarList } from "@wordpress/components";
import { useDispatch, useSelect } from "@wordpress/data";
import { store as noticesStore } from "@wordpress/notices";

// A context of its own stops a notice printing in the editor's list too.
export const NOTICE_CONTEXT = "wpcp-tools/palette";

// Nothing renders the notices store outside the editor.
export const PaletteNotices = () => {
	const snackbars = useSelect(
		(select) =>
			select(noticesStore)
				.getNotices(NOTICE_CONTEXT)
				.filter(({ type }) => type === "snackbar"),
		[],
	);
	const { removeNotice } = useDispatch(noticesStore);

	if (!snackbars.length) return null;

	return (
		<SnackbarList
			className="wpcp-tools-palette-notices"
			notices={snackbars}
			onRemove={(id: string) => removeNotice(id, NOTICE_CONTEXT)}
		/>
	);
};
