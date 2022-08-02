extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
'systemDialog.js',
)

extension_dir = join_paths(extensiondir, uuid)

install_subdir('assets', install_dir : extension_dir)
schema_data_dir = 'schemas'
subdir(schema_data_dir)
