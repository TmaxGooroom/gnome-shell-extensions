# gschemaname is set to desktop-icons-ng, but schema file name is ding.
schema_name = 'org.gnome.shell.extensions.ding.gschema.xml'


run_command('glib-compile-schemas', meson.current_source_dir())

install_data([
    'gschemas.compiled',
    schema_name
  ],
  install_dir : join_paths(extensiondir, uuid, schema_data_dir)
)

install_data([
    '10_desktop-icons-ng.gschema.override'
  ],
  install_dir : schemadir
)

extension_schemas += files(schema_name)
