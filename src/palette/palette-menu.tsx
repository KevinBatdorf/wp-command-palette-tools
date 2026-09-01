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
	type Ability,
	abilitySource,
	type Catalog,
	type CatalogState,
	catalogState,
} from "../lib/abilities";
import { abilityCatalog } from "../lib/ability-catalog";
import { rank } from "../lib/rank";
import {
	colorTools,
	funTools,
	mathTools,
	type ToolCommand,
} from "../lib/tool-commands";
import { fireNotice } from "../lib/wordpress";
import { AbilityForm } from "./ability-form";
import { NOTICE_CONTEXT } from "./palette-notices";
import { recents } from "./recents-store";
import { useOpenPalette } from "./use-open-palette";

type Result = {
	id: string;
	label: string;
	description?: string;
	keywords?: string[];
	detail?: string;
	select: () => void;
};

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

// A catalog that never arrived is worth saying even when tools answered.
const listMessage = (state: CatalogState | null, count: number) => {
	if (state === null) return null;
	if (state !== "ready") return notice(state);

	return count ? null : __("No results found.", "command-palette-tools");
};

const ResultGroup = ({
	heading,
	results,
}: {
	heading: string;
	results: Result[];
}) => {
	if (!results.length) return null;

	return (
		<Command.Group heading={heading}>
			{results.map((result) => (
				<Command.Item
					key={result.id}
					value={result.id}
					onSelect={result.select}
				>
					<div className="commands-command-menu__item">
						<span className="commands-command-menu__item-label">
							{result.label}
						</span>
						{result.detail && (
							<span className="commands-command-menu__item-category">
								{result.detail}
							</span>
						)}
					</div>
				</Command.Item>
			))}
		</Command.Group>
	);
};

export const PaletteMenu = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [catalog, setCatalog] = useState<Catalog | null>(null);
	const [recent, setRecent] = useState(recents.list);
	const [picked, setPicked] = useState<Ability | null>(null);

	const input = useRef<HTMLInputElement>(null);

	const toggle = useCallback(() => setIsOpen((open) => !open), []);
	useOpenPalette(toggle);

	const close = useCallback(() => {
		setSearch("");
		setPicked(null);
		setIsOpen(false);
	}, []);

	// Modal routes Escape here, so without this a form's Escape closes it all.
	const requestClose = useCallback(() => {
		if (picked) return setPicked(null);
		close();
	}, [close, picked]);

	// Modal focuses its frame, not the search field, so typing would go nowhere.
	useEffect(() => {
		if (picked) return;
		input.current?.focus();
	}, [isOpen, picked]);

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

	const runTool = useCallback(
		(tool: ToolCommand) => {
			close();
			void tool.run((message) => fireNotice(message, NOTICE_CONTEXT));
		},
		[close],
	);

	const selectAbility = useCallback((ability: Ability) => {
		setRecent(recents.remember(ability.name));
		setPicked(ability);
	}, []);

	// Math and colour are computed from the query, so never scored against it.
	const tools = useMemo<Result[]>(
		() =>
			[
				...mathTools(search),
				...colorTools(search),
				// An empty palette lists the site's abilities, not ours.
				...(search.trim() ? rank(funTools(), search) : []),
			].map((tool) => ({
				id: tool.id,
				label: tool.label,
				select: () => runTool(tool),
			})),
		[search, runTool],
	);

	const abilities = useMemo<Result[]>(
		() =>
			(catalog?.abilities ?? []).map((ability) => ({
				id: ability.name,
				label: ability.label,
				description: ability.description,
				// Nothing else makes `core/get-site-info` findable by typing it.
				keywords: [ability.name],
				detail: abilitySource(ability),
				select: () => selectAbility(ability),
			})),
		[catalog, selectAbility],
	);

	const ranked = useMemo(
		() => rank(abilities, search, recent),
		[abilities, search, recent],
	);

	// Once something is typed, recency is only a tie-break in the ranking.
	const [recentResults, otherResults] = useMemo(() => {
		if (search.trim()) return [[], ranked];

		const byId = new Map(ranked.map((result) => [result.id, result]));
		const listed = recent
			.map((id) => byId.get(id))
			.filter((result) => result !== undefined);
		const shown = new Set(listed.map((result) => result.id));

		return [listed, ranked.filter((result) => !shown.has(result.id))];
	}, [ranked, recent, search]);

	const state = catalog && catalogState(catalog);
	const count = tools.length + recentResults.length + otherResults.length;

	useEffect(() => {
		if (!isOpen || picked || state === null) return;

		// Waits out the keystroke so a screen reader announces one total, not six.
		const timer = setTimeout(() => {
			speak(
				sprintf(
					/* translators: %d: how many results match what was typed. */
					_n(
						"%d result found.",
						"%d results found.",
						count,
						"command-palette-tools",
					),
					count,
				),
			);
		}, 500);
		return () => clearTimeout(timer);
	}, [count, isOpen, picked, state]);

	if (!isOpen) return null;

	const message = listMessage(state, count);

	return (
		<Modal
			className="commands-command-menu wpcp-tools-palette"
			overlayClassName="commands-command-menu__overlay"
			onRequestClose={requestClose}
			__experimentalHideHeader
			size="medium"
			contentLabel={__("Ability palette", "command-palette-tools")}
		>
			{picked ? (
				<AbilityForm
					key={picked.name}
					ability={picked}
					onBack={() => setPicked(null)}
				/>
			) : (
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
						<Command.List label={__("Results", "command-palette-tools")}>
							{state === null && (
								<Command.Loading>
									{__("Loading abilities…", "command-palette-tools")}
								</Command.Loading>
							)}
							<ResultGroup
								heading={__("Recent", "command-palette-tools")}
								results={recentResults}
							/>
							<ResultGroup
								heading={__("Tools", "command-palette-tools")}
								results={tools}
							/>
							<ResultGroup
								heading={__("Abilities", "command-palette-tools")}
								results={otherResults}
							/>
							{message && (
								<div className="wpcp-tools-palette__notice">{message}</div>
							)}
						</Command.List>
					</Command>
				</div>
			)}
		</Modal>
	);
};
