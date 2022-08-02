schema_name = metadata_conf.get('gschemaname')  + '.gschema.xml'

r = run_command('glib-compile-schemas', meson.current_source_dir())

install_data([
  '10_notification-center.gschema.override'
  ],
  install_dir : schemadir
)

extension_schemas += files(schema_name)
