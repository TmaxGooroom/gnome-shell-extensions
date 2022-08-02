extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
  'extension.js',
  'prefs.js'
)

install_subdir('locale', install_dir : join_paths(extensiondir, uuid))

schema_data_dir = 'schemas'
subdir(schema_data_dir)
