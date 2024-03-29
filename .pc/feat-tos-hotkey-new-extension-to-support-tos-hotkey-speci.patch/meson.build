project('gnome-shell-extensions',
  version: '3.38.2',
  meson_version: '>= 0.44.0',
  license: 'GPL2+'
)

#Apply Git Hook Directory
hook_dir = join_paths(meson.source_root(), 'hooks')
run_command('git', 'config', 'core.hooksPath', hook_dir)

gettext_domain = meson.project_name()

gnome = import('gnome')
i18n = import('i18n')

datadir = get_option('datadir')

shelldir = join_paths(datadir, 'gnome-shell')
extensiondir = join_paths(shelldir, 'extensions')
modedir = join_paths(shelldir, 'modes')
themedir = join_paths(shelldir, 'theme')

schemadir = join_paths(datadir, 'glib-2.0', 'schemas')
sessiondir = join_paths(datadir, 'gnome-session', 'sessions')
xsessiondir = join_paths(datadir, 'xsessions')

ver_arr = meson.project_version().split('.')
if ver_arr[1].to_int().is_even()
  shell_version = '@0@.@1@'.format(ver_arr[0], ver_arr[1])
else
  shell_version = '.'.join(ver_arr)
endif

uuid_suffix = '@tmax-shell-extensions'

classic_extensions = [
  'apps-menu',
  'horizontal-workspaces',
  'places-menu',
  'launch-new-instance',
  'window-list'
]

tos_extensions = [
  'arc-menu',
  'dash-to-panel',
  'notification-center',
  'appindicator',
  'desktop-icons-ng',
  'alternate-tab',
  'search',
]


default_extensions = classic_extensions
default_extensions += [
  'drive-menu',
  'screenshot-window-sizer',
  'windowsNavigator',
  'workspace-indicator'
]

all_extensions = default_extensions + tos_extensions
all_extensions += [
  'auto-move-windows',
  'native-window-placement',
  'user-theme'
]

enabled_extensions = get_option('enable_extensions')

if enabled_extensions.length() == 0
  set = get_option('extension_set')

  if set == 'classic'
    enabled_extensions += classic_extensions
  elif set == 'tos'
    enabled_extensions += tos_extensions
  elif set == 'default'
    enabled_extensions += default_extensions
  elif set == 'all'
    enabled_extensions += all_extensions
  endif
endif

classic_mode_enabled = get_option('classic_mode')

if classic_mode_enabled
  # Sanity check: Make sure all classic extensions are enabled
  foreach e : classic_extensions
    if not enabled_extensions.contains(e)
      error('Classic mode is enabled, ' +
            'but the required extension @0@ is not.'.format(e))
    endif
  endforeach
endif

# Sanity check: Make sure enabled extensions are valid
foreach e : enabled_extensions
  if not all_extensions.contains(e)
    error('Invalid extension @0@.'.format(e))
  endif
endforeach

if classic_mode_enabled
  sassc = find_program('sassc', required: true)
  subdir('data')
endif

subdir('extensions')
subdir('po')
subdir('logging')
