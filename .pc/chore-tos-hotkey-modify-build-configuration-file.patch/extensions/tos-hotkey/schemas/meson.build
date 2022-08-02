run_command('glib-compile-schemas', meson.current_source_dir())

install_data([
    'gschemas.compiled',
    'org.gnome.shell.extensions.tos-hotkey.gschema.xml',
  ],
  install_dir : join_paths(extension_dir, schema_data_dir)
)

install_data([
    'org.gnome.shell.extensions.tos-hotkey.gschema.xml',
  ],
  install_dir : schemadir
)
