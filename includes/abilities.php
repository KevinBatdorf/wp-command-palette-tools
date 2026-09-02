<?php
/**
 * The abilities this plugin registers, and the categories they sit in.
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

require_once __DIR__ . '/abilities/helpers.php';
require_once __DIR__ . '/abilities/maintenance.php';
require_once __DIR__ . '/abilities/content.php';
require_once __DIR__ . '/abilities/meta.php';
require_once __DIR__ . '/runnable-abilities.php';

// An ability naming an unregistered category is dropped with a notice nobody sees.
add_action('wp_abilities_api_categories_init', function () {
	$categories = [
		'maintenance' => [
			__('Maintenance', 'command-palette-tools'),
			__('Jobs that keep a site healthy: scheduled events, caches, orphaned rows.', 'command-palette-tools'),
		],
		'content' => [
			__('Content', 'command-palette-tools'),
			__('Bulk edits across posts, authors and terms.', 'command-palette-tools'),
		],
		'abilities' => [
			__('Abilities', 'command-palette-tools'),
			__('Abilities that describe the abilities this site has.', 'command-palette-tools'),
		],
	];

	foreach ($categories as $slug => $category) {
		// get_instance() assigns itself before firing this, so asking does not re-enter.
		if (wp_has_ability_category($slug)) continue;

		wp_register_ability_category($slug, [
			'label' => $category[0],
			'description' => $category[1],
		]);
	}
});
