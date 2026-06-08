Pod::Spec.new do |s|
  s.name           = 'ScreenTime'
  s.version        = '0.1.0'
  s.summary        = 'KidsGuard screen-time native module'
  s.description    = 'Reads app usage / manages screen time.'
  s.author         = ''
  s.homepage       = 'https://kidsguard.local'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
