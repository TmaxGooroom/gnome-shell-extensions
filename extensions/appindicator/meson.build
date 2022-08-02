extension_data += configure_file(
  input: metadata_name + '.in',
  output: metadata_name,
  configuration: metadata_conf
)

extension_sources += files('appIndicator.js',
  'dbusMenu.js',
  'iconCache.js',
  'indicatorStatusIcon.js',
  'interfaces.js',
  'statusNotifierWatcher.js',
  'promiseUtils.js',
  'topicons.js',
  'util.js'
)

subdir('interfaces-xml')
