run_command('glib-compile-schemas', meson.current_source_dir())

install_data([
		'gschemas.compiled',
		'org.gnome.shell.extensions.dash-to-panel.gschema.xml',
		'10_dash-to-panel.gschema.override'
	],
	install_dir : join_paths(extension_dir, schema_data_dir)
)

install_data([
		'org.gnome.shell.extensions.dash-to-panel.gschema.xml'
	],
	install_dir : schemadir
)
