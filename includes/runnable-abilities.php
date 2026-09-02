<?php
/**
 * The route the palette uses to leave out abilities it would only be refused.
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

add_action('rest_api_init', function () {
	register_rest_route('wpcp/v1', '/runnable-abilities', [
		'methods' => 'GET',
		'callback' => 'wpcp_tools_runnable_abilities',
		'permission_callback' => fn() => current_user_can('edit_posts'),
	]);
});

// Core gates its listing on read alone, so it lists abilities the run refuses.
function wpcp_tools_runnable_abilities()
{
	$names = [];
	foreach (wp_get_abilities([]) as $ability) {
		if (!wpcp_tools_visible_ability($ability)) continue;
		// Only a definite no: someone else's callback throwing must not hide it.
		if (wpcp_tools_can_run_ability($ability) === false) continue;

		$names[] = $ability->get_name();
	}

	return ['names' => $names];
}
