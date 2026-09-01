import { speak } from "@wordpress/a11y";
import { Modal } from "@wordpress/components";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "@wordpress/element";
import { __, _n, sprintf } from "@wordpress/i18n";
import { Icon, search as searchIcon } from "@wordpress/icons";
import { Command } from "cmdk";
import {
	type Catalog,
	type CatalogState,
	catalogState,
	filterAbilities,
} from "../lib/abilities";
import { abilityCatalog } from "../lib/ability-catalog";
import { useOpenPalette } from "./use-open-palette";

const notice = (state: CatalogState) => {
	switch (state) {
		case "unavailable":
			return __(
				"This site does not offer the Abilities API.",
				"command-palette-tools",
			);
		case "forbidden":
			return __(
				"You are not allowed to list abilities.",
				"command-palette-tools",
			);
		case "failed":
			return __("Abilities could not be loaded.", "command-palette-tools");
		default:
			return __(
				"No abilities are registered on this site.",
				"command-palette-tools",
			);
	}
};

export const PaletteMenu = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [catalog, setCatalog] = useState<Catalog | null>(null);

	const input = useRef<HTMLInputElement>(null);

	const toggle = useCallback(() => setIsOpen((open) => !open), []);
	useOpenPalette(toggle);

	// Modal focuses its frame, not the search field, so typing would go nowhere.
	useEffect(() => {
		input.current?.focus();
	}, [isOpen]);

	// Admin-wide, so fetching on mount would hit every admin page load.
	useEffect(() => {
		if (!isOpen) return;

		let stale = false;
		abilityCatalog.load().then((loaded) => {
			if (!stale) setCatalog(loaded);
		});
		return () => {
			stale = true;
		};
	}, [isOpen]);

	const abilities = useMemo(
		() => filterAbilities(catalog?.abilities ?? [], search),
		[catalog, search],
	);
	const state = catalog && catalogState(catalog);
	const count = abilities.length;

	useEffect(() => {
		if (!isOpen || state !== "ready") return;

		// Waits out the keystroke so a screen reader announces one total, not six.
		const timer = setTimeout(() => {
			speak(
				sprintf(
					/* translators: %d: how many abilities match what was typed. */
					_n(
						"%d ability found.",
						"%d abilities found.",
						count,
						"command-palette-tools",
					),
					count,
				),
			);
		}, 500);
		return () => clearTimeout(timer);
	}, [count, isOpen, state]);

	if (!isOpen) return null;

	const close = () => {
		setSearch("");
		setIsOpen(false);
	};

	return (
		<Modal
			className="commands-command-menu wpcp-tools-palette"
			overlayClassName="commands-command-menu__overlay"
			onRequestClose={close}
			__experimentalHideHeader
			size="medium"
			contentLabel={__("Ability palette", "command-palette-tools")}
		>
			<div className="commands-command-menu__container">
				<Command
					label={__("Search abilities", "command-palette-tools")}
					shouldFilter={false}
					loop
				>
					<div className="commands-command-menu__header">
						<Icon
							className="commands-command-menu__header-search-icon"
							icon={searchIcon}
						/>
						<Command.Input
							ref={input}
							value={search}
							onValueChange={setSearch}
							placeholder={__("Search abilities", "command-palette-tools")}
						/>
					</div>
					<Command.List label={__("Abilities", "command-palette-tools")}>
						{state === null && (
							<Command.Loading>
								{__("Loading abilities…", "command-palette-tools")}
							</Command.Loading>
						)}
						{state !== null && state !== "ready" && (
							<Command.Empty>{notice(state)}</Command.Empty>
						)}
						{state === "ready" && count === 0 && (
							<Command.Empty>
								{__("No abilities found.", "command-palette-tools")}
							</Command.Empty>
						)}
						{state === "ready" && count > 0 && (
							<Command.Group heading={__("Abilities", "command-palette-tools")}>
								{abilities.map((ability) => (
									<Command.Item key={ability.name} value={ability.name}>
										<div className="commands-command-menu__item">
											<span className="commands-command-menu__item-label">
												{ability.label}
											</span>
											<span className="commands-command-menu__item-category">
												{ability.category}
											</span>
										</div>
									</Command.Item>
								))}
							</Command.Group>
						)}
					</Command.List>
				</Command>
			</div>
		</Modal>
	);
};
