sassc = find_program('sassc')
run_command(sassc, '-a', '_stylesheet.scss', 'stylesheet.css')

extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files(
  'qwertyMap.js',
  'utils.js',
  'keyboardWrapper.js',
  'adapter.js',
  'keyButton.js',
)
