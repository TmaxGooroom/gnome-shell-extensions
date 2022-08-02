extension_data += configure_file(

  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
  'extension.js',
  'prefs.js'
)

extension_dir = join_paths(extensiondir, uuid)
install_subdir('locale', install_dir : extension_dir)
install_subdir('img', install_dir : extension_dir)

schema_data_dir = 'schemas'
subdir(schema_data_dir)
subdir('locale')
