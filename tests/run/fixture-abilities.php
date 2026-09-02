<?php
/**
 * Plugin Name: Command Palette Tools test abilities
 * Description: Abilities a stock site has none of: one that changes something, one that deletes something, one that fails.
 *
 * @package kevinbatdorf
 */

defined('ABSPATH') or die;

// Nothing is written: the method and the transport are what these prove.
add_action('wp_abilities_api_init', function () {
	wp_register_ability('wpcp-test/rename-site', [
		'label' => 'Rename Test Site',
		'description' => 'Changes the title of this test site.',
		'category' => 'site',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'title' => ['type' => 'string', 'description' => 'The title to use.'],
			],
			'required' => ['title'],
			'additionalProperties' => false,
		],
		'output_schema' => ['type' => 'object'],
		'execute_callback' => fn($input) => ['renamed' => $input['title']],
		'permission_callback' => fn() => current_user_can('manage_options'),
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => false, 'idempotent' => false],
		],
	]);

	wp_register_ability('wpcp-test/purge-cache', [
		'label' => 'Purge Test Cache',
		'description' => 'Deletes one cached entry from this test site.',
		'category' => 'site',
		'input_schema' => [
			'type' => 'object',
			'properties' => [
				'id' => ['type' => 'integer', 'description' => 'Which entry to purge.'],
			],
			'required' => ['id'],
			'additionalProperties' => false,
		],
		'output_schema' => ['type' => 'object'],
		'execute_callback' => fn($input) => ['purged' => $input['id']],
		'permission_callback' => fn() => current_user_can('manage_options'),
		'meta' => [
			'public' => true,
			'annotations' => ['destructive' => true, 'idempotent' => true],
		],
	]);

	// A discriminated union, which is how WooCommerce writes its product schemas.
	wp_register_ability('wpcp-test/book-a-slot', [
		'label' => 'Book Test Slot',
		'description' => 'Takes one of two shapes depending on what is being booked.',
		'category' => 'site',
		'input_schema' => [
			'type' => 'object',
			'oneOf' => [
				[
					'type' => 'object',
					'properties' => [
						'kind' => ['type' => 'string', 'enum' => ['room']],
						'name' => ['type' => 'string', 'description' => 'Who it is for.'],
						'floor' => ['type' => 'integer'],
					],
					'required' => ['kind', 'name'],
					'additionalProperties' => false,
				],
				[
					'type' => 'object',
					'properties' => [
						'kind' => ['type' => 'string', 'enum' => ['desk']],
						'name' => ['type' => 'string', 'description' => 'Who it is for.'],
						'standing' => ['type' => 'boolean'],
					],
					'required' => ['kind', 'name'],
					'additionalProperties' => false,
				],
			],
		],
		'output_schema' => ['type' => 'object'],
		'execute_callback' => fn($input) => ['booked' => $input],
		'permission_callback' => fn() => current_user_can('manage_options'),
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => false, 'destructive' => false, 'idempotent' => false],
		],
	]);

	// No input schema at all is how an ability says it takes none.
	wp_register_ability('wpcp-test/always-fails', [
		'label' => 'Fail Test Run',
		'description' => 'Answers with an error however it is run.',
		'category' => 'site',
		'output_schema' => ['type' => 'object'],
		'execute_callback' => fn() => new WP_Error(
			'wpcp_test_failed',
			'The test ability refused to run.',
			['status' => 500]
		),
		'permission_callback' => fn() => current_user_can('manage_options'),
		'meta' => [
			'public' => true,
			'annotations' => ['readonly' => true, 'idempotent' => true],
		],
	]);
});
