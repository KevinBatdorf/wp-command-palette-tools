<?php
/**
 * Abilities for the jobs WordPress gives you no screen for: scheduled events,
 * autoloaded options, orphaned uploads, expired transients, the trash.
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

add_action('wp_abilities_api_init', function () {
	wp_register_ability('wpcp/list-cron-events', [
		'label' => __('List scheduled events', 'command-palette-tools'),
		'description' => __('Every WP-Cron event this site has scheduled, when it is next due, and how far past due it already is. WordPress ships no screen for this.', 'command-palette-tools'),
		'category' => 'maintenance',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'hook' => [
					'type' => 'string',
					'title' => __('Hook contains', 'command-palette-tools'),
					'description' => __('Only events whose hook name contains this.', 'command-palette-tools'),
				],
				'overdue_only' => [
					'type' => 'boolean',
					'title' => __('Overdue only', 'command-palette-tools'),
					'description' => __('Leave out events that are not due yet.', 'command-palette-tools'),
					'default' => false,
				],
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('manage_options'),
		'execute_callback' => 'wpcp_tools_list_cron_events',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => true, 'destructive' => false, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/run-cron-event', [
		'label' => __('Run a scheduled event now', 'command-palette-tools'),
		'description' => __('Fires one scheduled event immediately instead of waiting for it to come due. A recurring event is put back on the schedule first, so running it early never costs the site a recurrence. The event runs inside this request, so a slow job can take the request down with it.', 'command-palette-tools'),
		'category' => 'maintenance',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'hook' => wpcp_tools_choice_field([
					'title' => __('Event', 'command-palette-tools'),
					'description' => __('The scheduled hook to fire.', 'command-palette-tools'),
				], wpcp_tools_scheduled_hooks()),
			],
			'required' => ['hook'],
			'additionalProperties' => false,
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('manage_options'),
		'execute_callback' => 'wpcp_tools_run_cron_event',
		// Running a job has effects, and running it twice runs it twice.
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => false, 'idempotent' => false],
		],
	]);

	wp_register_ability('wpcp/list-autoloaded-options', [
		'label' => __('List autoloaded options', 'command-palette-tools'),
		'description' => __('The largest rows WordPress loads out of the options table on every single request, and what they add up to. Invisible from the admin, and the usual reason a site is slow for no apparent reason.', 'command-palette-tools'),
		'category' => 'maintenance',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'limit' => [
					'type' => 'integer',
					'title' => __('Limit', 'command-palette-tools'),
					'description' => __('How many of the largest to name.', 'command-palette-tools'),
					'minimum' => 1,
					'maximum' => 200,
					'default' => 20,
				],
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('manage_options'),
		'execute_callback' => 'wpcp_tools_list_autoloaded_options',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => true, 'destructive' => false, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/list-unattached-media', [
		'label' => __('List unattached media', 'command-palette-tools'),
		'description' => __('Uploads that no post claims: no parent, not a featured image, and not referenced by ID anywhere in post content. Plugins that keep their own record of an attachment — page builders, custom fields, the site logo — are invisible to this, so treat the list as candidates to check rather than files that are safe to delete.', 'command-palette-tools'),
		'category' => 'maintenance',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'older_than_days' => [
					'type' => 'integer',
					'title' => __('Older than (days)', 'command-palette-tools'),
					'description' => __('Only uploads added at least this many days ago.', 'command-palette-tools'),
					'minimum' => 0,
					'default' => 0,
				],
				'limit' => [
					'type' => 'integer',
					'title' => __('Limit', 'command-palette-tools'),
					'description' => __('How many to list.', 'command-palette-tools'),
					'minimum' => 1,
					'maximum' => 200,
					'default' => 20,
				],
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('upload_files'),
		'execute_callback' => 'wpcp_tools_list_unattached_media',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => true, 'destructive' => false, 'idempotent' => true],
		],
	]);

	// No input schema at all is how an ability says it takes none.
	wp_register_ability('wpcp/delete-expired-transients', [
		'label' => __('Delete expired transients', 'command-palette-tools'),
		'description' => __('Clears out cached values whose expiry has already passed. WordPress only does this on its own twice a day, and a site with an object cache never does it at all, so the rows sit in the options table indefinitely.', 'command-palette-tools'),
		'category' => 'maintenance',
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('manage_options'),
		'execute_callback' => 'wpcp_tools_delete_expired_transients',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => true, 'idempotent' => true],
		],
	]);

	wp_register_ability('wpcp/empty-trashed-posts', [
		'label' => __('Empty trashed posts', 'command-palette-tools'),
		'description' => __('Permanently deletes posts sitting in the trash. The admin makes you do it one post type and one screen at a time.', 'command-palette-tools'),
		'category' => 'maintenance',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'post_type' => wpcp_tools_post_type_field(),
				'older_than_days' => [
					'type' => 'integer',
					'title' => __('Older than (days)', 'command-palette-tools'),
					'description' => __('Counted from when the post was trashed, not from when it was written.', 'command-palette-tools'),
					'minimum' => 0,
					'default' => 0,
				],
				'limit' => wpcp_tools_limit_field(100),
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('delete_others_posts'),
		'execute_callback' => 'wpcp_tools_empty_trashed_posts',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => true, 'idempotent' => true],
		],
	]);

	// Split off: a gate reading its input cannot answer a listing, which has none.
	wp_register_ability('wpcp/delete-spam-and-trashed-comments', [
		'label' => __('Delete spam and trashed comments', 'command-palette-tools'),
		'description' => __('Permanently deletes comments marked as spam or moved to the trash. Emptying either list in the admin is a button per screen, and neither has an age filter.', 'command-palette-tools'),
		'category' => 'maintenance',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'targets' => [
					'type' => 'array',
					'title' => __('Delete', 'command-palette-tools'),
					'items' => ['type' => 'string', 'enum' => ['spam', 'trash']],
					'default' => ['spam', 'trash'],
				],
				'older_than_days' => [
					'type' => 'integer',
					'title' => __('Older than (days)', 'command-palette-tools'),
					'description' => __('Counted from when the comment was written.', 'command-palette-tools'),
					'minimum' => 0,
					'default' => 0,
				],
				'limit' => wpcp_tools_limit_field(100),
			],
			'additionalProperties' => false,
			'default' => [],
		],
		'output_schema' => ['type' => 'object'],
		'permission_callback' => fn() => current_user_can('moderate_comments'),
		'execute_callback' => 'wpcp_tools_delete_flagged_comments',
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => true, 'idempotent' => true],
		],
	]);
});

// Read per request, so the Select's options are never stale.
function wpcp_tools_scheduled_hooks()
{
	$hooks = [];
	foreach (_get_cron_array() ?: [] as $events) {
		foreach (array_keys($events) as $hook) $hooks[$hook] = true;
	}

	ksort($hooks);

	return array_keys($hooks);
}

function wpcp_tools_list_cron_events($input)
{
	$hook = (string) wpcp_tools_input($input, 'hook', '');
	$overdue_only = (bool) wpcp_tools_input($input, 'overdue_only', false);
	$now = time();

	$events = [];
	foreach (_get_cron_array() ?: [] as $timestamp => $hooks) {
		foreach ($hooks as $name => $signatures) {
			if ($hook !== '' && stripos($name, $hook) === false) continue;

			foreach ($signatures as $event) {
				$overdue = max(0, $now - (int) $timestamp);
				if ($overdue_only && $overdue === 0) continue;

				$events[] = [
					'hook' => $name,
					// A one-off event has no schedule rather than a named one.
					'schedule' => empty($event['schedule']) ? 'once' : $event['schedule'],
					'next_run_gmt' => gmdate('c', (int) $timestamp),
					'seconds_overdue' => $overdue,
					'args' => array_values((array) ($event['args'] ?? [])),
				];
			}
		}
	}

	usort($events, fn($a, $b) => strcmp($a['next_run_gmt'], $b['next_run_gmt']));

	return [
		'events' => $events,
		'total' => count($events),
		'overdue' => count(array_filter($events, fn($event) => $event['seconds_overdue'] > 0)),
		// With this on, nothing runs until a real cron job reaches wp-cron.php.
		'wp_cron_disabled' => defined('DISABLE_WP_CRON') && DISABLE_WP_CRON,
	];
}

function wpcp_tools_run_cron_event($input)
{
	$hook = (string) wpcp_tools_input($input, 'hook', '');
	if ($hook === '') {
		return new WP_Error(
			'wpcp_tools_no_hook',
			__('No scheduled event was named.', 'command-palette-tools'),
			['status' => 400]
		);
	}

	$found = null;
	foreach (_get_cron_array() ?: [] as $timestamp => $hooks) {
		if (!isset($hooks[$hook])) continue;

		foreach ($hooks[$hook] as $event) {
			if ($found === null || $timestamp < $found['timestamp']) {
				$found = array_merge($event, ['timestamp' => (int) $timestamp]);
			}
		}
	}

	if ($found === null) {
		return new WP_Error(
			'wpcp_tools_event_not_found',
			/* translators: %s: WP-Cron hook name. */
			sprintf(__('No event named "%s" is on the schedule.', 'command-palette-tools'), $hook),
			['status' => 404]
		);
	}

	$args = array_values((array) ($found['args'] ?? []));

	// Reschedule first: a callback that dies must not cost the site its recurrence.
	if (!empty($found['schedule'])) {
		wp_reschedule_event($found['timestamp'], $found['schedule'], $hook, $args);
	}
	wp_unschedule_event($found['timestamp'], $hook, $args);

	$started = microtime(true);
	do_action_ref_array($hook, $args);

	return [
		'hook' => $hook,
		'ran_at_gmt' => gmdate('c'),
		'duration_ms' => (int) round((microtime(true) - $started) * 1000),
		'rescheduled' => !empty($found['schedule']),
	];
}

function wpcp_tools_list_autoloaded_options($input)
{
	global $wpdb;

	$limit = max(1, min(200, (int) wpcp_tools_input($input, 'limit', 20)));
	// 6.6 split one 'yes' into four values that all mean autoload.
	$values = function_exists('wp_autoload_values_to_autoload')
		? wp_autoload_values_to_autoload()
		: ['yes'];
	$in = wpcp_tools_placeholders($values);

	$rows = $wpdb->get_results($wpdb->prepare(
		"SELECT option_name, LENGTH(option_value) AS bytes FROM {$wpdb->options}
		WHERE autoload IN ($in) ORDER BY bytes DESC LIMIT %d",
		array_merge($values, [$limit])
	));

	$totals = $wpdb->get_row($wpdb->prepare(
		"SELECT COUNT(*) AS rows_count, COALESCE(SUM(LENGTH(option_value)), 0) AS bytes
		FROM {$wpdb->options} WHERE autoload IN ($in)",
		$values
	));

	return [
		'options' => array_map(fn($row) => [
			'name' => $row->option_name,
			'bytes' => (int) $row->bytes,
		], $rows ?: []),
		'total_count' => (int) ($totals->rows_count ?? 0),
		'total_bytes' => (int) ($totals->bytes ?? 0),
	];
}

function wpcp_tools_list_unattached_media($input)
{
	$limit = max(1, min(200, (int) wpcp_tools_input($input, 'limit', 20)));
	$days = max(0, (int) wpcp_tools_input($input, 'older_than_days', 0));

	$args = [
		'post_type' => 'attachment',
		'post_status' => 'inherit',
		'post_parent' => 0,
		'posts_per_page' => $limit,
		'orderby' => 'date',
		'order' => 'ASC',
		'fields' => 'ids',
		'post__not_in' => wpcp_tools_claimed_attachment_ids(),
	];

	if ($days > 0) {
		$args['date_query'] = [[
			'before' => gmdate('Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS),
			'column' => 'post_date_gmt',
		]];
	}

	$query = new WP_Query($args);

	$items = [];
	foreach ($query->posts as $id) {
		$path = get_attached_file($id);

		$items[] = [
			'id' => (int) $id,
			'title' => get_the_title($id),
			'url' => wp_get_attachment_url($id),
			'mime_type' => get_post_mime_type($id),
			'uploaded_gmt' => get_post_field('post_date_gmt', $id),
			'bytes' => $path && file_exists($path) ? (int) filesize($path) : null,
			'edit_url' => get_edit_post_link($id, 'raw'),
		];
	}

	return [
		'media' => $items,
		'total' => (int) $query->found_posts,
		'remaining' => max(0, (int) $query->found_posts - count($items)),
	];
}

// One pass over the content, rather than one query per candidate.
function wpcp_tools_claimed_attachment_ids()
{
	global $wpdb;

	$claimed = [];
	foreach ($wpdb->get_col("SELECT DISTINCT meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_thumbnail_id'") ?: [] as $id) {
		$claimed[(int) $id] = true;
	}

	$chunk = 200;
	$offset = 0;
	do {
		// Chunked: every post's content at once will not fit in memory.
		$contents = $wpdb->get_col($wpdb->prepare(
			"SELECT post_content FROM {$wpdb->posts}
			WHERE post_status != 'trash' AND post_content != ''
			ORDER BY ID ASC LIMIT %d OFFSET %d",
			$chunk,
			$offset
		)) ?: [];

		foreach ($contents as $content) {
			foreach (wpcp_tools_attachment_ids_in($content) as $id) $claimed[$id] = true;
		}

		$offset += $chunk;
	} while (count($contents) === $chunk);

	unset($claimed[0]);

	return array_keys($claimed);
}

// Loose on purpose: calling a file used is the safe way to be wrong here.
function wpcp_tools_attachment_ids_in($content)
{
	$ids = [];

	foreach (['/wp-image-(\d+)/', '/"(?:id|mediaId)":\s*(\d+)/'] as $pattern) {
		if (preg_match_all($pattern, $content, $matches)) {
			$ids = array_merge($ids, $matches[1]);
		}
	}

	// A gallery keeps a list rather than one id.
	if (preg_match_all('/"ids":\s*\[([\d,\s]+)\]/', $content, $matches)) {
		foreach ($matches[1] as $list) {
			$ids = array_merge($ids, preg_split('/\D+/', $list, -1, PREG_SPLIT_NO_EMPTY));
		}
	}

	return array_map('intval', $ids);
}

function wpcp_tools_delete_expired_transients()
{
	$before = wpcp_tools_expired_transient_count();
	// Forced, or an external object cache skips the table entirely.
	delete_expired_transients(true);
	$after = wpcp_tools_expired_transient_count();

	return [
		'deleted' => max(0, $before - $after),
		'expired_remaining' => $after,
	];
}

// Timeout rows are the only place an expiry is written.
function wpcp_tools_expired_transient_count()
{
	global $wpdb;

	return (int) $wpdb->get_var($wpdb->prepare(
		"SELECT COUNT(*) FROM {$wpdb->options}
		WHERE (option_name LIKE %s OR option_name LIKE %s) AND option_value < %d",
		$wpdb->esc_like('_transient_timeout_') . '%',
		$wpdb->esc_like('_site_transient_timeout_') . '%',
		time()
	));
}

function wpcp_tools_empty_trashed_posts($input)
{
	global $wpdb;

	$days = max(0, (int) wpcp_tools_input($input, 'older_than_days', 0));
	$args = [
		'post_type' => wpcp_tools_chosen_post_types($input),
		'post_status' => 'trash',
		'posts_per_page' => wpcp_tools_bounded_limit($input, 100),
		'fields' => 'ids',
	];

	// When a post was trashed is its own meta; post_date is when it was written.
	if ($days > 0) {
		$args['meta_query'] = [[
			'key' => '_wp_trash_meta_time',
			'value' => time() - $days * DAY_IN_SECONDS,
			'compare' => '<',
			'type' => 'NUMERIC',
		]];
	}

	$deleted = 0;
	foreach ((new WP_Query($args))->posts as $id) {
		if (wp_delete_post((int) $id, true)) $deleted++;
	}

	return [
		'deleted' => $deleted,
		'remaining' => (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_status = 'trash'"
		),
	];
}

function wpcp_tools_delete_flagged_comments($input)
{
	$targets = wpcp_tools_input($input, 'targets', ['spam', 'trash']);
	$targets = is_array($targets) ? array_intersect($targets, ['spam', 'trash']) : [];
	$limit = wpcp_tools_bounded_limit($input, 100);
	$days = max(0, (int) wpcp_tools_input($input, 'older_than_days', 0));

	$deleted = ['spam' => 0, 'trash' => 0];
	$remaining = 0;
	foreach ($targets as $status) {
		$ids = get_comments([
			'status' => $status,
			'number' => $limit,
			'fields' => 'ids',
			'date_query' => $days > 0
				? [['before' => gmdate('Y-m-d H:i:s', time() - $days * DAY_IN_SECONDS), 'column' => 'comment_date_gmt']]
				: [],
		]);

		foreach ($ids as $id) {
			if (wp_delete_comment((int) $id, true)) $deleted[$status]++;
		}

		$remaining += (int) get_comments(['status' => $status, 'count' => true]);
	}

	return ['deleted' => $deleted, 'remaining' => $remaining];
}
