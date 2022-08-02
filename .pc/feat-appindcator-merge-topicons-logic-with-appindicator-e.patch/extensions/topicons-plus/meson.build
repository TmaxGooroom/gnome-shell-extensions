extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files('prefs.js',
  'convenience.js'
)


schema_data_dir = 'schemas'
subdir(schema_data_dir)
