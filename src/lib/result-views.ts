// No WP imports: `node --test` runs this and cannot resolve them, so every
// visible string is either data or a key the component translates.

export type TextKey =
	| "run-now"
	| "update"
	| "delete"
	| "add-note"
	| "update-status"
	| "apply-for-real"
	| "reassign-from"
	| "total"
	| "overdue"
	| "remaining"
	| "total-size"
	| "posts-changed"
	| "replacements"
	| "deleted"
	| "published"
	| "closed"
	| "reassigned"
	| "objects-moved"
	| "children-reparented"
	| "expired-remaining";

export type Action = {
	key: TextKey;
	ability: string;
	input: Record<string, unknown>;
	destructive?: boolean;
};

export type Stat = { key: TextKey; value: string };

export type Row = {
	key: string;
	cells: string[];
	href?: string;
	actions: Action[];
};

export type Item = { label: string; value: string; href?: string };

export type ResultView =
	| {
			kind: "table";
			columns: string[];
			rows: Row[];
			stats: Stat[];
			actions: Action[];
	  }
	| { kind: "summary"; items: Item[]; stats: Stat[]; actions: Action[] }
	| { kind: "json"; value: unknown };

type Bag = Record<string, unknown>;

const bag = (value: unknown): Bag =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Bag)
		: {};

const listOf = (value: unknown, key: string): Bag[] => {
	const found = bag(value)[key];

	return Array.isArray(found) ? found.map(bag) : [];
};

const text = (value: unknown): string => {
	if (value === null || value === undefined || value === "") return "—";
	if (typeof value === "boolean") return value ? "✓" : "—";
	if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
	if (typeof value === "object") return "—";

	return String(value);
};

const num = (value: unknown): number => {
	const found = typeof value === "number" ? value : Number(value);

	return Number.isFinite(found) ? found : 0;
};

const link = (value: unknown): string | undefined =>
	typeof value === "string" && /^https?:\/\//.test(value) ? value : undefined;

// Binary, because what this measures is a MySQL row length.
export const bytes = (value: unknown): string => {
	const size = num(value);
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

// Unit letters rather than words: nothing here can translate a phrase.
export const duration = (seconds: unknown): string => {
	const total = Math.max(0, Math.floor(num(seconds)));
	if (total < 60) return `${total}s`;

	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes}m`;

	const hours = Math.floor(minutes / 60);
	if (hours < 48) return `${hours}h ${minutes % 60}m`;

	return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

// The site's own date format is not reachable from here.
export const when = (value: unknown): string => {
	const found = typeof value === "string" ? value : "";
	const match = found.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);

	return match ? `${match[1]} ${match[2]}` : text(value);
};

const money = (row: Bag, key: string): string => {
	const amount = text(row[key]);
	const symbol =
		typeof row.currency_symbol === "string" ? row.currency_symbol : "";

	return amount === "—" ? amount : `${symbol}${amount}`;
};

const stat = (key: TextKey, value: unknown): Stat => ({
	key,
	value: text(value),
});

const withStats = (stats: Stat[]): ResultView => ({
	kind: "summary",
	items: [],
	stats: stats.filter((entry) => entry.value !== "—"),
	actions: [],
});

const cronEvents = (output: unknown): ResultView => ({
	kind: "table",
	columns: ["Hook", "Schedule", "Next run", "Overdue"],
	rows: listOf(output, "events").map((event, index) => ({
		key: `${text(event.hook)}-${index}`,
		cells: [
			text(event.hook),
			text(event.schedule),
			when(event.next_run_gmt),
			num(event.seconds_overdue) ? duration(event.seconds_overdue) : "—",
		],
		actions: [
			{
				key: "run-now",
				ability: "wpcp/run-cron-event",
				input: { hook: text(event.hook) },
			},
		],
	})),
	stats: [
		stat("total", bag(output).total),
		stat("overdue", bag(output).overdue),
	],
	actions: [],
});

const autoloadedOptions = (output: unknown): ResultView => ({
	kind: "table",
	columns: ["Option", "Size"],
	rows: listOf(output, "options").map((option) => ({
		key: text(option.name),
		cells: [text(option.name), bytes(option.bytes)],
		actions: [],
	})),
	stats: [
		stat("total", bag(output).total_count),
		{ key: "total-size", value: bytes(bag(output).total_bytes) },
	],
	actions: [],
});

const unattachedMedia = (output: unknown): ResultView => ({
	kind: "table",
	columns: ["File", "Type", "Size", "Uploaded"],
	rows: listOf(output, "media").map((item) => ({
		key: text(item.id),
		cells: [
			text(item.title),
			text(item.mime_type),
			bytes(item.bytes),
			when(item.uploaded_gmt),
		],
		href: link(item.edit_url) ?? link(item.url),
		actions: [],
	})),
	stats: [
		stat("total", bag(output).total),
		stat("remaining", bag(output).remaining),
	],
	actions: [],
});

const searchReplace = (output: unknown, input: unknown): ResultView => {
	const posts = listOf(output, "posts");
	const offerReal = bag(output).dry_run === true && posts.length > 0;

	return {
		kind: "table",
		columns: ["Post", "Replacements"],
		rows: posts.map((post) => ({
			key: text(post.id),
			cells: [text(post.title), text(post.replacements)],
			href: link(post.edit_url),
			actions: [],
		})),
		stats: [
			stat("posts-changed", bag(output).posts_changed),
			stat("replacements", bag(output).replacements),
			stat("remaining", bag(output).remaining),
		],
		actions: offerReal
			? [
					{
						key: "apply-for-real",
						ability: "wpcp/search-replace-content",
						input: { ...bag(input), dry_run: false },
						destructive: true,
					},
				]
			: [],
	};
};

const missedSchedules = (output: unknown): ResultView => ({
	kind: "table",
	columns: ["Post"],
	rows: listOf(output, "published").map((post) => ({
		key: text(post.id),
		cells: [text(post.title)],
		actions: [],
	})),
	stats: [
		stat("published", bag(output).count),
		stat("remaining", bag(output).remaining),
	],
	actions: [],
});

const products = (output: unknown): ResultView => ({
	kind: "table",
	columns: ["Product", "Price", "Stock", "Status"],
	rows: listOf(output, "products").map((product) => ({
		key: text(product.id),
		cells: [
			text(product.name),
			money(product, "price"),
			text(product.stock_status),
			text(product.status),
		],
		href: link(product.permalink),
		actions: [
			{
				key: "update",
				ability: "woocommerce/product-update",
				input: { id: num(product.id) },
			},
			{
				key: "delete",
				ability: "woocommerce/product-delete",
				input: { id: num(product.id) },
				destructive: true,
			},
		],
	})),
	stats: [],
	actions: [],
});

const orders = (output: unknown): ResultView => ({
	kind: "table",
	columns: ["Order", "Status", "Total", "Customer", "Placed"],
	rows: listOf(output, "orders").map((order) => ({
		key: text(order.id),
		cells: [
			`#${text(order.id)}`,
			text(order.status),
			money(order, "total"),
			text(order.billing_email),
			when(order.date_created),
		],
		actions: [
			{
				key: "update-status",
				ability: "woocommerce/order-update-status",
				input: { id: num(order.id) },
			},
			{
				key: "add-note",
				ability: "woocommerce/order-add-note",
				input: { id: num(order.id) },
			},
		],
	})),
	stats: [],
	actions: [],
});

const oneProduct = (output: unknown): ResultView => {
	const product = bag(bag(output).product);

	return {
		kind: "summary",
		items: [
			{
				label: "Name",
				value: text(product.name),
				href: link(product.permalink),
			},
			{ label: "Price", value: money(product, "price") },
			{ label: "Stock", value: text(product.stock_status) },
			{ label: "Status", value: text(product.status) },
		],
		stats: [],
		actions: product.id
			? [
					{
						key: "update",
						ability: "woocommerce/product-update",
						input: { id: num(product.id) },
					},
				]
			: [],
	};
};

const oneOrder = (output: unknown): ResultView => {
	const order = bag(bag(output).order ?? output);

	return {
		kind: "summary",
		items: [
			{ label: "Order", value: `#${text(order.id)}` },
			{ label: "Status", value: text(order.status) },
			{ label: "Total", value: money(order, "total") },
			{ label: "Customer", value: text(order.billing_email) },
		],
		stats: [],
		actions: order.id
			? [
					{
						key: "add-note",
						ability: "woocommerce/order-add-note",
						input: { id: num(order.id) },
					},
				]
			: [],
	};
};

const userInfo = (output: unknown): ResultView => {
	const user = bag(output);
	const login = text(user.user_login);

	return {
		kind: "summary",
		items: [
			{ label: "Name", value: text(user.display_name) },
			{ label: "Username", value: login },
			{ label: "Roles", value: text(user.roles) },
			{ label: "Locale", value: text(user.locale) },
		],
		stats: [],
		actions:
			login === "—"
				? []
				: [
						{
							key: "reassign-from",
							ability: "wpcp/reassign-author",
							input: { from: login },
						},
					],
	};
};

const keyValues = (output: unknown): ResultView => {
	const items = Object.entries(bag(output))
		.filter(([, value]) => value === null || typeof value !== "object")
		.map(([label, value]) => ({
			label,
			value: text(value),
			href: link(value),
		}));

	return items.length
		? { kind: "summary", items, stats: [], actions: [] }
		: { kind: "json", value: output };
};

const BUILDERS: Record<
	string,
	(output: unknown, input: unknown) => ResultView
> = {
	"core/get-user-info": userInfo,
	"wpcp/list-cron-events": cronEvents,
	"wpcp/list-autoloaded-options": autoloadedOptions,
	"wpcp/list-unattached-media": unattachedMedia,
	"wpcp/search-replace-content": searchReplace,
	"wpcp/publish-missed-schedules": missedSchedules,
	"wpcp/empty-trash": (output) => {
		const deleted = bag(bag(output).deleted);

		return withStats([
			{
				key: "deleted",
				value: String(
					num(deleted.posts) + num(deleted.comments) + num(deleted.spam),
				),
			},
			stat("remaining", bag(output).trashed_posts_remaining),
		]);
	},
	"wpcp/delete-expired-transients": (output) =>
		withStats([
			stat("deleted", bag(output).deleted),
			stat("expired-remaining", bag(output).expired_remaining),
		]),
	"wpcp/close-comments": (output) =>
		withStats([
			stat("closed", bag(output).closed),
			stat("remaining", bag(output).remaining),
		]),
	"wpcp/reassign-author": (output) =>
		withStats([
			stat("reassigned", bag(output).reassigned),
			stat("remaining", bag(output).remaining),
		]),
	"wpcp/merge-terms": (output) =>
		withStats([
			stat("objects-moved", bag(output).objects_moved),
			stat("children-reparented", bag(output).children_reparented),
		]),
	"woocommerce/products-query": products,
	"woocommerce/product-create": oneProduct,
	"woocommerce/product-update": oneProduct,
	"woocommerce/orders-query": orders,
	"woocommerce/order-update-status": oneOrder,
	"woocommerce/order-add-note": oneOrder,
};

export const resultView = (
	name: string,
	output: unknown,
	input?: unknown,
): ResultView => {
	if (output === null || output === undefined) {
		return { kind: "summary", items: [], stats: [], actions: [] };
	}

	const build = BUILDERS[name];
	if (build) return build(output, input);

	return typeof output === "object" && !Array.isArray(output)
		? keyValues(output)
		: { kind: "json", value: output };
};

export const isEmptyView = (view: ResultView) =>
	view.kind === "summary" && !view.items.length && !view.stats.length;

export const runsOnOpen = (readonly: boolean | undefined, required: string[]) =>
	!!readonly && !required.length;
