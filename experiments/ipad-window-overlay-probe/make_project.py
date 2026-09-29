"""Generate the two tiny, dependency-free native iPad targets deterministically."""
from pathlib import Path
import hashlib
import plistlib

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT / 'WindowOverlayProbe.xcodeproj'
objects = []

def uid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()

def add(name, body):
    objects.append(f'\t\t{uid(name)} = {{ {body} }};')
    return uid(name)

def array(items):
    return '( ' + ', '.join(items) + ', )'

target_ids, source_ids, product_ids = [], [], []
for name, delegate in [('GlassProbe', 'GlassSceneDelegate'), ('BackdropProbe', 'BackdropSceneDelegate')]:
    bundle = 'org.learningcompanion.experiment.' + name.lower()
    info = {
        'CFBundleDevelopmentRegion': 'en',
        'CFBundleExecutable': '$(EXECUTABLE_NAME)',
        'CFBundleIdentifier': '$(PRODUCT_BUNDLE_IDENTIFIER)',
        'CFBundleInfoDictionaryVersion': '6.0',
        'CFBundleName': '$(PRODUCT_NAME)',
        'CFBundleDisplayName': name,
        'CFBundlePackageType': 'APPL',
        'CFBundleShortVersionString': '0.1.0',
        'CFBundleVersion': '1',
        'LSRequiresIPhoneOS': True,
        'UILaunchScreen': {},
        'UIUserInterfaceStyle': 'Light',
        'UISupportedInterfaceOrientations': [
            'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft',
            'UIInterfaceOrientationLandscapeRight', 'UIInterfaceOrientationPortraitUpsideDown'],
        'UIApplicationSceneManifest': {
            'UIApplicationSupportsMultipleScenes': False,
            'UISceneConfigurations': {
                'UIWindowSceneSessionRoleApplication': [{
                    'UISceneConfigurationName': name,
                    'UISceneDelegateClassName': f'$(PRODUCT_MODULE_NAME).{delegate}'}]}}
    }
    (ROOT / 'Config').mkdir(exist_ok=True)
    (ROOT / 'Config' / f'{name}-Info.plist').write_bytes(plistlib.dumps(info))
    source = add(name + 'source', f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = Sources/{name}.swift; sourceTree = "<group>";')
    source_ids.append(source)
    product = add(name + 'product', f'isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = {name}.app; sourceTree = BUILT_PRODUCTS_DIR;')
    product_ids.append(product)
    build = add(name + 'build', f'isa = PBXBuildFile; fileRef = {source};')
    sources = add(name + 'sources', f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {array([build])}; runOnlyForDeploymentPostprocessing = 0;')
    frameworks = add(name + 'frameworks', 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
    configs = []
    for config in ('Debug', 'Release'):
        settings = f'''
            CODE_SIGN_STYLE = Automatic;
            GENERATE_INFOPLIST_FILE = NO;
            INFOPLIST_FILE = Config/{name}-Info.plist;
            IPHONEOS_DEPLOYMENT_TARGET = 17.0;
            PRODUCT_BUNDLE_IDENTIFIER = {bundle};
            PRODUCT_NAME = "$(TARGET_NAME)";
            SDKROOT = iphoneos;
            SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
            SUPPORTS_MACCATALYST = NO;
            SWIFT_VERSION = 5.0;
            TARGETED_DEVICE_FAMILY = 2;
            ENABLE_USER_SCRIPT_SANDBOXING = YES;
            SWIFT_OPTIMIZATION_LEVEL = "{'-Onone' if config == 'Debug' else '-O'}";
            DEBUG_INFORMATION_FORMAT = dwarf;
        '''
        configs.append(add(name + config, f'isa = XCBuildConfiguration; buildSettings = {{ {settings} }}; name = {config};'))
    config_list = add(name + 'configs', f'isa = XCConfigurationList; buildConfigurations = {array(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
    target_ids.append(add(name + 'target', f'isa = PBXNativeTarget; buildConfigurationList = {config_list}; buildPhases = {array([sources, frameworks])}; buildRules = (); dependencies = (); name = {name}; productName = {name}; productReference = {product}; productType = "com.apple.product-type.application";'))
    schemes = PROJECT / 'xcshareddata' / 'xcschemes'
    schemes.mkdir(parents=True, exist_ok=True)
    reference = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid(name + "target")}" BuildableName="{name}.app" BlueprintName="{name}" ReferencedContainer="container:WindowOverlayProbe.xcodeproj"/>'
    (schemes / f'{name}.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2600" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference}</BuildActionEntry></BuildActionEntries></BuildAction>
  <TestAction buildConfiguration="Debug"/>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></LaunchAction>
  <ProfileAction buildConfiguration="Release"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''', encoding='utf-8')

products = add('products', f'isa = PBXGroup; children = {array(product_ids)}; name = Products; sourceTree = "<group>";')
main = add('main', f'isa = PBXGroup; children = {array(source_ids + [products])}; sourceTree = "<group>";')
configs = [add('project' + name, f'isa = XCBuildConfiguration; buildSettings = {{ CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; }}; name = {name};') for name in ('Debug', 'Release')]
config_list = add('projectconfigs', f'isa = XCConfigurationList; buildConfigurations = {array(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
root = add('project', f'isa = PBXProject; attributes = {{ LastUpgradeCheck = 2600; }}; buildConfigurationList = {config_list}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base,); mainGroup = {main}; productRefGroup = {products}; projectDirPath = ""; projectRoot = ""; targets = {array(target_ids)};')
(PROJECT / 'project.pbxproj').write_text('// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {};\n\tobjectVersion = 56;\n\tobjects = {\n' + '\n'.join(objects) + f'\n\t}};\n\trootObject = {root};\n}}\n', encoding='utf-8')
print('Generated two independent UIKit app targets.')
