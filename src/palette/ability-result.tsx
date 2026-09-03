import { Button, ExternalLink } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import type { Action, ResultView, Stat, TextKey } from "../lib/result-views";

const actionText = (key: TextKey) => {
	switch (key) {
		case "run-now":
			return __("Run now", "command-palette-tools");
		case "update":
			return __("Edit", "command-palette-tools");
		case "delete":
			return __("Delete", "command-palette-tools");
		case "add-note":
			return __("Add note", "command-palette-tools");
		case "update-status":
			return __("Change status", "command-palette-tools");
		case "apply-for-real":
			return __("Replace for real", "command-palette-tools");
		default:
			return __("Reassign their posts", "command-palette-tools");
	}
};

const statText = (key: TextKey) => {
	switch (key) {
		case "total":
			return __("Total", "command-palette-tools");
		case "overdue":
			return __("Overdue", "command-palette-tools");
		case "remaining":
			return __("Remaining", "command-palette-tools");
		case "total-size":
			return __("Total size", "command-palette-tools");
		case "posts-changed":
			return __("Posts changed", "command-palette-tools");
		case "replacements":
			return __("Replacements", "command-palette-tools");
		case "deleted":
			return __("Deleted", "command-palette-tools");
		case "published":
			return __("Published", "command-palette-tools");
		case "closed":
			return __("Closed", "command-palette-tools");
		case "reassigned":
			return __("Reassigned", "command-palette-tools");
		case "objects-moved":
			return __("Moved", "command-palette-tools");
		case "children-reparented":
			return __("Re-parented", "command-palette-tools");
		default:
			return __("Still expired", "command-palette-tools");
	}
};

type Follow = (action: Action) => void;

const ActionButtons = ({
	actions,
	offers,
	follow,
}: {
	actions: Action[];
	offers: (name: string) => boolean;
	follow: Follow;
}) => {
	const offered = actions.filter((action) => offers(action.ability));
	if (!offered.length) return null;

	return (
		<div className="wpcp-tools-palette__row-actions">
			{offered.map((action) => (
				<Button
					key={`${action.key}-${action.ability}`}
					variant="secondary"
					size="small"
					isDestructive={action.destructive}
					onClick={() => follow(action)}
				>
					{actionText(action.key)}
				</Button>
			))}
		</div>
	);
};

const Stats = ({ stats }: { stats: Stat[] }) =>
	stats.length ? (
		<dl className="wpcp-tools-palette__stats">
			{stats.map((entry) => (
				<div key={entry.key}>
					<dt>{statText(entry.key)}</dt>
					<dd>{entry.value}</dd>
				</div>
			))}
		</dl>
	) : null;

export const AbilityResult = ({
	view,
	offers,
	follow,
}: {
	view: ResultView;
	offers: (name: string) => boolean;
	follow: Follow;
}) => {
	if (view.kind === "json") {
		return (
			<pre className="wpcp-tools-palette__result">
				{typeof view.value === "string"
					? view.value
					: JSON.stringify(view.value, null, 2)}
			</pre>
		);
	}

	if (view.kind === "summary") {
		if (!view.items.length && !view.stats.length) {
			return (
				<p className="wpcp-tools-palette__help">
					{__("The ability ran and returned nothing.", "command-palette-tools")}
				</p>
			);
		}

		return (
			<div className="wpcp-tools-palette__outcome">
				<Stats stats={view.stats} />
				{view.items.length > 0 && (
					<dl className="wpcp-tools-palette__facts">
						{view.items.map((item) => (
							<div key={item.label}>
								<dt>{item.label}</dt>
								<dd>
									{item.href ? (
										<ExternalLink href={item.href}>{item.value}</ExternalLink>
									) : (
										item.value
									)}
								</dd>
							</div>
						))}
					</dl>
				)}
				<ActionButtons actions={view.actions} offers={offers} follow={follow} />
			</div>
		);
	}

	if (!view.rows.length) {
		return (
			<div className="wpcp-tools-palette__outcome">
				<Stats stats={view.stats} />
				<p className="wpcp-tools-palette__help">
					{__("Nothing matched.", "command-palette-tools")}
				</p>
			</div>
		);
	}

	const showActions = view.rows.some((row) =>
		row.actions.some((action) => offers(action.ability)),
	);

	return (
		<div className="wpcp-tools-palette__outcome">
			<Stats stats={view.stats} />
			<div className="wpcp-tools-palette__table-scroll">
				<table className="wpcp-tools-palette__table">
					<thead>
						<tr>
							{view.columns.map((column) => (
								<th key={column} scope="col">
									{column}
								</th>
							))}
							{showActions && (
								<th scope="col">
									<span className="screen-reader-text">
										{__("Actions", "command-palette-tools")}
									</span>
								</th>
							)}
						</tr>
					</thead>
					<tbody>
						{view.rows.map((row) => (
							<tr key={row.key}>
								{row.cells.map((cell, index) => (
									<td key={view.columns[index] ?? String(index)}>
										{index === 0 && row.href ? (
											<ExternalLink href={row.href}>{cell}</ExternalLink>
										) : (
											cell
										)}
									</td>
								))}
								{showActions && (
									<td>
										<ActionButtons
											actions={row.actions}
											offers={offers}
											follow={follow}
										/>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<ActionButtons actions={view.actions} offers={offers} follow={follow} />
		</div>
	);
};
