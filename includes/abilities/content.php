<?php
/**
 * Abilities for content chores the admin makes you do one row at a time, or
 * makes you install something to do at all.
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

add_action('wp_abilities_api_init', function () {
	wp_register_ability('wpcp/merge-terms', [
		'label' => __('Merge two terms', 'command-palette-tools'),
		'description' => __('Moves everything filed under one category or tag onto another, re-parents its children, and deletes the term left behind. There is no screen for this anywhere in WordPress.', 'command-palette-tools'),
		'category' => 'content',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'taxonomy' => wpcp_tools_choice_field([
					'title' => __('Taxonomy', 'command-palette-tools'),
					'description' => __('Which set of terms both belong to.', 'command-palette-tools'),
				], wpcp_tools_taxonomies()),
				'from' => [
					'type' => 'string',
					'title' => __('Merge away', 'command-palette-tools'),
					'description' => __('The term to empty and delete. Name, slug or ID.', 'command-palette-tools'),
				],
				'into' => [
					'type' => 'string',
					'title' => __('Merge into', 'command-palette-tools'),
					'description' => __('The term to keep. Name, slug or ID.', 'command-palette-tools'),
				],
			],
			'required' => ['taxonomy', 'from', 'into'],
			'additionalProperties' => false,
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => 'wpcp_tools_can_merge_terms',
		'execute_callback' => 'wpcp_tools_merge_terms',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => true, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/reassign-author', [
		'label' => __('Reassign posts to another author', 'command-palette-tools'),
		'description' => __('Hands every post by one author to another. WordPress only offers this while deleting the user; short of that it is Quick Edit, one post at a time.', 'command-palette-tools'),
		'category' => 'content',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'from' => wpcp_tools_choice_field([
					'title' => __('From', 'command-palette-tools'),
					'description' => __('The author to take posts from. Username, email or ID.', 'command-palette-tools'),
				], wpcp_tools_user_logins()),
				'to' => wpcp_tools_choice_field([
					'title' => __('To', 'command-palette-tools'),
					'description' => __('The author to give them to. Username, email or ID.', 'command-palette-tools'),
				], wpcp_tools_user_logins()),
				'post_type' => wpcp_tools_post_type_field(),
				'limit' => wpcp_tools_limit_field(100),
			],
			'required' => ['from', 'to'],
			'additionalProperties' => false,
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('edit_others_posts') && current_user_can('list_users'),
		'execute_callback' => 'wpcp_tools_reassign_author',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => false, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/close-comments', [
		'label' => __('Close comments on old posts', 'command-palette-tools'),
		'description' => __('Closes comments and pingbacks on posts past a certain age. The Discussion setting only applies to posts written after you turn it on, so everything already published stays open until someone edits it.', 'command-palette-tools'),
		'category' => 'content',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'older_than_days' => [
					'type' => 'integer',
					'title' => __('Older than (days)', 'command-palette-tools'),
					'description' => __('Only posts published at least this many days ago.', 'command-palette-tools'),
					'minimum' => 0,
					'default' => 90,
				],
				'post_type' => wpcp_tools_post_type_field(),
				'close_pings' => [
					'type' => 'boolean',
					'title' => __('Close pingbacks too', 'command-palette-tools'),
					'default' => true,
				],
				'limit' => wpcp_tools_limit_field(200),
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('edit_others_posts'),
		'execute_callback' => 'wpcp_tools_close_comments',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => false, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/publish-missed-schedules', [
		'label' => __('Publish posts that missed their schedule', 'command-palette-tools'),
		'description' => __('Publishes posts still sitting on a schedule date that has already passed. WP-Cron drops these silently and the admin only shows them as "Missed schedule" if you happen to look.', 'command-palette-tools'),
		'category' => 'content',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'grace_minutes' => [
					'type' => 'integer',
					'title' => __('Grace period (minutes)', 'command-palette-tools'),
					'description' => __('Leave alone anything due more recently than this.', 'command-palette-tools'),
					'minimum' => 0,
					'default' => 0,
				],
				'post_type' => wpcp_tools_post_type_field(),
				'limit' => wpcp_tools_limit_field(50),
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('edit_others_posts') && current_user_can('publish_posts'),
		'execute_callback' => 'wpcp_tools_publish_missed_schedules',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => false, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/search-replace-content', [
		'label' => __('Find and replace across posts', 'command-palette-tools'),
		'description' => __('Replaces a string everywhere it appears in post titles, content or excerpts. Matching is case sensitive, and it reports what it would change without changing anything until you turn the dry run off. Doing this in WordPress otherwise means WP-CLI or a plugin.', 'command-palette-tools'),
		'category' => 'content',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'search' => [
					'type' => 'string',
					'title' => __('Find', 'command-palette-tools'),
					'description' => __('The exact text to look for.', 'command-palette-tools'),
					'minLength' => 1,
				],
				'replace' => [
					'type' => 'string',
					'title' => __('Replace with', 'command-palette-tools'),
					'description' => __('Leave empty to delete the text instead.', 'command-palette-tools'),
					'default' => '',
				],
				'fields' => [
					'type' => 'array',
					'title' => __('Look in', 'command-palette-tools'),
					'items' => ['type' => 'string', 'enum' => ['title', 'content', 'excerpt']],
					'minItems' => 1,
					'default' => ['content'],
				],
				'post_type' => wpcp_tools_post_type_field(),
				'dry_run' => [
					'type' => 'boolean',
					'title' => __('Dry run', 'command-palette-tools'),
					'description' => __('Report the matches and change nothing.', 'command-palette-tools'),
					'default' => true,
				],
				'limit' => wpcp_tools_limit_field(100),
			],
			'required' => ['search'],
			'additionalProperties' => false,
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('edit_others_posts'),
		'execute_callback' => 'wpcp_tools_search_replace_content',
		// A replace run twice is not the same as a replace run once.
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => true, 'idempotent' => false],
		],
	]);
});

// Empty past 100 users, where a Select is worse than the text field behind it.
function wpcp_tools_user_logins()
{
	$users = get_users(['fields' => ['user_login'], 'number' => 101, 'orderby' => 'login']);
	if (count($users) > 100) return [];

	return array_map(fn($user) => $user->user_login, $users);
}

function wpcp_tools_find_user($value)
{
	if ($value === null || $value === '') return null;

	$user = get_user_by('login', $value);
	if (!$user && is_numeric($value)) $user = get_user_by('id', (int) $value);
	if (!$user) $user = get_user_by('email', $value);

	return $user ?: null;
}

function wpcp_tools_find_term($value, $taxonomy)
{
	if ($value === null || $value === '') return null;

	$term = get_term_by('slug', $value, $taxonomy);
	if (!$term) $term = get_term_by('name', $value, $taxonomy);
	if (!$term && is_numeric($value)) {
		$found = get_term((int) $value, $taxonomy);
		$term = ($found instanceof WP_Term) ? $found : false;
	}

	return $term ?: null;
}

function wpcp_tools_can_merge_terms($input)
{
	$taxonomy = get_taxonomy((string) wpcp_tools_input($input, 'taxonomy', ''));
	if (!$taxonomy) return false;

	return current_user_can($taxonomy->cap->manage_terms)
		&& current_user_can($taxonomy->cap->delete_terms);
}

function wpcp_tools_merge_terms($input)
{
	$taxonomy = (string) wpcp_tools_input($input, 'taxonomy', '');
	if (!taxonomy_exists($taxonomy)) {
		return new WP_Error(
			'wpcp_tools_unknown_taxonomy',
			/* translators: %s: taxonomy name. */
			sprintf(__('There is no taxonomy called "%s".', 'command-palette-tools'), $taxonomy),
			['status' => 400]
		);
	}

	$from = wpcp_tools_find_term(wpcp_tools_input($input, 'from'), $taxonomy);
	$into = wpcp_tools_find_term(wpcp_tools_input($input, 'into'), $taxonomy);

	if (!$from || !$into) {
		return new WP_Error(
			'wpcp_tools_term_not_found',
			__('One of those terms does not exist in that taxonomy.', 'command-palette-tools'),
			['status' => 404]
		);
	}

	if ($from->term_id === $into->term_id) {
		return new WP_Error(
			'wpcp_tools_same_term',
			__('Those are the same term.', 'command-palette-tools'),
			['status' => 400]
		);
	}

	$objects = get_objects_in_term($from->term_id, $taxonomy);
	$moved = 0;
	foreach (is_wp_error($objects) ? [] : $objects as $object_id) {
		// Appended, so an object already in both keeps everything else it has.
		if (!is_wp_error(wp_set_object_terms((int) $object_id, [$into->term_id], $taxonomy, true))) {
			$moved++;
		}
	}

	// Children would be orphaned by the delete, so they move first.
	$children = get_terms([
		'taxonomy' => $taxonomy,
		'parent' => $from->term_id,
		'hide_empty' => false,
		'fields' => 'ids',
	]);
	$reparented = 0;
	foreach (is_wp_error($children) ? [] : $children as $child) {
		if (!is_wp_error(wp_update_term((int) $child, $taxonomy, ['parent' => $into->term_id]))) {
			$reparented++;
		}
	}

	$deleted = wp_delete_term($from->term_id, $taxonomy);
	if (is_wp_error($deleted)) return $deleted;

	return [
		'taxonomy' => $taxonomy,
		'merged' => ['name' => $from->name, 'id' => (int) $from->term_id],
		'into' => ['name' => $into->name, 'id' => (int) $into->term_id],
		'objects_moved' => $moved,
		'children_reparented' => $reparented,
	];
}

function wpcp_tools_reassign_author($input)
{
	$from = wpcp_tools_find_user(wpcp_tools_input($input, 'from'));
	$to = wpcp_tools_find_user(wpcp_tools_input($input, 'to'));

	if (!$from || !$to) {
		return new WP_Error(
			'wpcp_tools_user_not_found',
			__('One of those users does not exist.', 'command-palette-tools'),
			['status' => 404]
		);
	}

	if ($from->ID === $to->ID) {
		return new WP_Error(
			'wpcp_tools_same_user',
			__('Those are the same user.', 'command-palette-tools'),
			['status' => 400]
		);
	}

	$query = new WP_Query([
		'author' => $from->ID,
		'post_type' => wpcp_tools_chosen_post_types($input),
		'post_status' => 'any',
		'posts_per_page' => wpcp_tools_bounded_limit($input, 100),
		'fields' => 'ids',
		'ignore_sticky_posts' => true,
	]);

	$moved = 0;
	foreach ($query->posts as $id) {
		$updated = wp_update_post(['ID' => (int) $id, 'post_author' => $to->ID], true);
		if (!is_wp_error($updated)) $moved++;
	}

	return [
		'from' => $from->user_login,
		'to' => $to->user_login,
		'reassigned' => $moved,
		'remaining' => max(0, (int) $query->found_posts - $moved),
	];
}

function wpcp_tools_close_comments($input)
{
	global $wpdb;

	$days = max(0, (int) wpcp_tools_input($input, 'older_than_days', 90));
	$close_pings = (bool) wpcp_tools_input($input, 'close_pings', true);
	$limit = wpcp_tools_bounded_limit($input, 200);
	$types = wpcp_tools_chosen_post_types($input);
	$cutoff = gmdate('Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS);
	$in = wpcp_tools_placeholders($types);

	// WP_Query has no argument for comment_status, and it is a column on posts.
	// Published only: nothing else has a comment form in front of anyone.
	$where = "WHERE comment_status = 'open' AND post_status = 'publish'
		AND post_type IN ($in) AND post_date_gmt < %s";
	$params = array_merge($types, [$cutoff]);

	$total = (int) $wpdb->get_var($wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->posts} $where",
		$params
	));
	$ids = $wpdb->get_col($wpdb->prepare(
		"SELECT ID FROM {$wpdb->posts} $where ORDER BY post_date_gmt ASC LIMIT %d",
		array_merge($params, [$limit])
	));

	$closed = 0;
	foreach ($ids ?: [] as $id) {
		$post = ['ID' => (int) $id, 'comment_status' => 'closed'];
		if ($close_pings) $post['ping_status'] = 'closed';

		if (!is_wp_error(wp_update_post($post, true))) $closed++;
	}

	return [
		'closed' => $closed,
		'remaining' => max(0, $total - $closed),
	];
}

function wpcp_tools_publish_missed_schedules($input)
{
	global $wpdb;

	$grace = max(0, (int) wpcp_tools_input($input, 'grace_minutes', 0));
	$limit = wpcp_tools_bounded_limit($input, 50);
	$types = wpcp_tools_chosen_post_types($input);
	$cutoff = gmdate('Y-m-d H:i:s', time() - $grace * MINUTE_IN_SECONDS);
	$in = wpcp_tools_placeholders($types);

	$where = "WHERE post_status = 'future' AND post_type IN ($in) AND post_date_gmt <= %s";
	$params = array_merge($types, [$cutoff]);

	$total = (int) $wpdb->get_var($wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->posts} $where",
		$params
	));
	$ids = $wpdb->get_col($wpdb->prepare(
		"SELECT ID FROM {$wpdb->posts} $where ORDER BY post_date_gmt ASC LIMIT %d",
		array_merge($params, [$limit])
	));

	$published = [];
	foreach ($ids ?: [] as $id) {
		wp_publish_post((int) $id);

		if (get_post_status((int) $id) === 'publish') {
			$published[] = ['id' => (int) $id, 'title' => get_the_title((int) $id)];
		}
	}

	return [
		'published' => $published,
		'count' => count($published),
		'remaining' => max(0, $total - count($published)),
	];
}

function wpcp_tools_search_replace_content($input)
{
	global $wpdb;

	$search = (string) wpcp_tools_input($input, 'search', '');
	if ($search === '') {
		return new WP_Error(
			'wpcp_tools_no_search',
			__('There is nothing to look for.', 'command-palette-tools'),
			['status' => 400]
		);
	}

	$replace = (string) wpcp_tools_input($input, 'replace', '');
	$dry_run = (bool) wpcp_tools_input($input, 'dry_run', true);
	$limit = wpcp_tools_bounded_limit($input, 100);
	$types = wpcp_tools_chosen_post_types($input);

	$columns = ['title' => 'post_title', 'content' => 'post_content', 'excerpt' => 'post_excerpt'];
	$fields = wpcp_tools_input($input, 'fields', ['content']);
	$chosen = array_intersect_key($columns, array_flip(is_array($fields) ? $fields : []));
	if (!$chosen) $chosen = ['content' => 'post_content'];

	// BINARY: str_replace is case sensitive, so a looser match reports dead rows.
	$like = '%' . $wpdb->esc_like($search) . '%';
	$matches = implode(' OR ', array_map(fn($column) => "$column LIKE BINARY %s", $chosen));
	$in = wpcp_tools_placeholders($types);
	// Trash is left alone: a restored post would come back rewritten.
	$where = "WHERE post_type IN ($in) AND post_status != 'trash' AND ($matches)";
	$params = array_merge($types, array_fill(0, count($chosen), $like));

	$total = (int) $wpdb->get_var($wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->posts} $where",
		$params
	));
	$rows = $wpdb->get_results($wpdb->prepare(
		"SELECT ID, post_title, post_content, post_excerpt FROM {$wpdb->posts} $where
		ORDER BY ID ASC LIMIT %d",
		array_merge($params, [$limit])
	));

	$changed = [];
	$replacements = 0;
	foreach ($rows ?: [] as $row) {
		$update = ['ID' => (int) $row->ID];
		$found = 0;

		foreach ($chosen as $column) {
			$count = substr_count($row->$column, $search);
			if ($count === 0) continue;

			$found += $count;
			// wp_update_post() expects slashed data and unslashes it on the way in.
			$update[$column] = wp_slash(str_replace($search, $replace, $row->$column));
		}

		if ($found === 0) continue;

		// A refused update is not a change, and an overcounting dry run is worthless.
		if (!$dry_run && is_wp_error(wp_update_post($update, true))) continue;

		$replacements += $found;
		$changed[] = [
			'id' => (int) $row->ID,
			'title' => $row->post_title,
			'replacements' => $found,
			'edit_url' => get_edit_post_link((int) $row->ID, 'raw'),
		];
	}

	return [
		'dry_run' => $dry_run,
		'posts' => $changed,
		'posts_changed' => count($changed),
		'replacements' => $replacements,
		'remaining' => max(0, $total - count($rows ?: [])),
	];
}
