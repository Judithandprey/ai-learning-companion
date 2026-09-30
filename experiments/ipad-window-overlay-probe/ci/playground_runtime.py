"""Run exact R2/R3 Playground Swift sources in isolated iPad Simulator apps.

This validates SwiftUI application startup and the candidate's visible controls.
It does not exercise Swift Playground import, a physical iPad/Pencil, or another
app behind the window. Source files are copied byte-for-byte without rewriting.
"""
from pathlib import Path
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import time


ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ['PROBE_OUT']).resolve()
BUILD = Path(os.environ['PROBE_BUILD']).resolve()
OUT.mkdir(parents=True, exist_ok=True)
BUILD.mkdir(parents=True, exist_ok=True)
PROJECT = BUILD / 'PlaygroundRuntime.xcodeproj'
DERIVED = BUILD / 'DerivedData'
RESULT = OUT / 'candidate-ui.xcresult'
BUNDLES = {
    'R2Baseline': 'org.learningcompanion.playgroundruntime.r2',
    'R3Candidate': 'org.learningcompanion.playgroundruntime.r3',
}
report = {
    'scope': 'Exact Playground Swift source hosted by isolated SwiftUI iPad Simulator apps; startup and canvas controls only.',
    'playgroundImport': 'NOT_TESTED',
    'physicalDevice': 'NOT_TESTED',
    'physicalPencil': 'NOT_TESTED',
    'transparencyOverOtherApp': 'NOT_TESTED',
    'crossAppFingerRouting': 'NOT_TESTED',
    'persistentTopmost': 'NOT_TESTED',
    'sources': {},
    'steps': [],
}


def save():
    (OUT / 'playground-runtime.json').write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def run(name, args, timeout=120, required=True):
    started = time.monotonic()
    print(name, flush=True)
    log = OUT / (name + '.log')
    with log.open('w', encoding='utf-8') as stream:
        try:
            process = subprocess.run(args, stdout=stream, stderr=subprocess.STDOUT,
                                     text=True, timeout=timeout)
            code = process.returncode
            timed_out = False
        except subprocess.TimeoutExpired:
            code, timed_out = None, True
    item = {'name': name, 'args': [str(x) for x in args], 'exitCode': code,
            'timedOut': timed_out, 'seconds': round(time.monotonic() - started, 2),
            'log': log.name}
    report['steps'].append(item)
    save()
    output = log.read_text(encoding='utf-8', errors='replace')
    if code != 0:
        print(output[-5000:], flush=True)
        if required:
            raise RuntimeError(f'{name} failed (exit={code}, timeout={timed_out}); see {log.name}')
    return code == 0, output.strip()


def uid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()


def array(items):
    return '( ' + ', '.join(items) + ', )' if items else '()'


UI_TEST = '''import XCTest

final class PlaygroundRuntimeTests: XCTestCase {
    private func geometry(_ element: XCUIElement) -> [String: Any] {
        let frame = element.frame
        return ["exists": element.exists, "hittable": element.isHittable,
                "x": Double(frame.minX), "y": Double(frame.minY),
                "width": Double(frame.width), "height": Double(frame.height)]
    }

    private func keepGeometry(_ name: String, _ elements: [String: XCUIElement]) {
        let frames = elements.mapValues { geometry($0) }
        let data = try! JSONSerialization.data(withJSONObject: frames, options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(string: String(data: data, encoding: .utf8)!)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testStartupAndOpenCanvas() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let banner = app.descendants(matching: .any).matching(identifier: "probe.startupBanner").firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 20), "R3 startup banner must appear")
        XCTAssertTrue(banner.isHittable, "R3 startup banner must be visible")
        let startup = XCTAttachment(screenshot: app.screenshot())
        startup.name = "R3-startup-visible"
        startup.lifetime = .keepAlways
        add(startup)

        let open = app.buttons["probe.openCanvas"]
        XCTAssertTrue(open.waitForExistence(timeout: 10), "Open-canvas button must appear")
        XCTAssertTrue(open.isHittable, "Open-canvas button must be tappable")
        XCTAssertGreaterThan(app.frame.width, 100)
        XCTAssertGreaterThan(app.frame.height, 100)
        keepGeometry("R3-startup-geometry", ["app": app, "banner": banner, "openCanvas": open])
        open.tap()
        let controls = app.descendants(matching: .any).matching(identifier: "probe.canvasControls").firstMatch
        let pen = app.buttons["笔"]
        let eraser = app.buttons["橡皮"]
        let navigation = app.buttons["导航"]
        let appeared = NSPredicate { _, _ in
            (controls.exists && controls.isHittable) ||
            (pen.exists && pen.isHittable && eraser.exists && eraser.isHittable &&
             navigation.exists && navigation.isHittable)
        }
        let expectation = XCTNSPredicateExpectation(predicate: appeared, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 20), .completed,
                       "Canvas controls must be visible after opening")
        var canvasElements: [String: XCUIElement] = ["app": app]
        if controls.exists { canvasElements["controls"] = controls }
        if pen.exists { canvasElements["pen"] = pen }
        if eraser.exists { canvasElements["eraser"] = eraser }
        if navigation.exists { canvasElements["navigation"] = navigation }
        keepGeometry("R3-canvas-geometry", canvasElements)
        let canvas = XCTAttachment(screenshot: app.screenshot())
        canvas.name = "R3-canvas-controls-visible"
        canvas.lifetime = .keepAlways
        add(canvas)
    }
}
'''


def generate_project():
    objects, sources, products, targets = [], [], [], []

    def add(name, body):
        objects.append(f'\t\t{uid(name)} = {{ {body} }};')
        return uid(name)

    source_paths = {
        'R2Baseline': ROOT / 'evidence/playground-v2/GlassProbe.swift',
        'R3Candidate': ROOT / 'playground/GlassPlayground.swiftpm/Sources/GlassProbe.swift',
    }
    for name, source in source_paths.items():
        content = source.read_bytes()
        directory = BUILD / name
        directory.mkdir(exist_ok=True)
        copied = directory / 'GlassProbe.swift'
        copied.write_bytes(content)
        digest = hashlib.sha256(content).hexdigest()
        assert hashlib.sha256(copied.read_bytes()).hexdigest() == digest
        report['sources'][name] = {'repositoryPath': str(source.relative_to(ROOT)),
                                   'sha256': digest, 'copiedByteForByte': True}
        shutil.copyfile(source, OUT / f'{name}-GlassProbe.swift')
        info = {
            'CFBundleDevelopmentRegion': 'en',
            'CFBundleExecutable': '$(EXECUTABLE_NAME)',
            'CFBundleIdentifier': '$(PRODUCT_BUNDLE_IDENTIFIER)',
            'CFBundleInfoDictionaryVersion': '6.0',
            'CFBundleName': '$(PRODUCT_NAME)',
            'CFBundleDisplayName': name,
            'CFBundlePackageType': 'APPL',
            'CFBundleShortVersionString': '0.1',
            'CFBundleVersion': '1',
            'LSRequiresIPhoneOS': True,
            'UILaunchScreen': {},
            'UIUserInterfaceStyle': 'Light',
            # SwiftUI owns scene configuration. No UIKit scene delegate is added.
            'UIApplicationSceneManifest': {'UIApplicationSupportsMultipleScenes': False,
                                          'UISceneConfigurations': {}},
            'UISupportedInterfaceOrientations': [
                'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationLandscapeLeft',
                'UIInterfaceOrientationLandscapeRight', 'UIInterfaceOrientationPortraitUpsideDown'],
        }
        (directory / 'Info.plist').write_bytes(plistlib.dumps(info))

    tests = BUILD / 'RuntimeUITests'
    tests.mkdir(exist_ok=True)
    (tests / 'PlaygroundRuntimeTests.swift').write_text(UI_TEST, encoding='utf-8')

    for name in ('R2Baseline', 'R3Candidate', 'RuntimeUITests'):
        is_test = name == 'RuntimeUITests'
        filename = 'PlaygroundRuntimeTests.swift' if is_test else 'GlassProbe.swift'
        source = add(name + 'source', f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}/{filename}; sourceTree = "<group>";')
        sources.append(source)
        extension = 'xctest' if is_test else 'app'
        file_type = 'wrapper.cfbundle' if is_test else 'wrapper.application'
        product = add(name + 'product', f'isa = PBXFileReference; explicitFileType = {file_type}; includeInIndex = 0; path = {name}.{extension}; sourceTree = BUILT_PRODUCTS_DIR;')
        products.append(product)
        build = add(name + 'build', f'isa = PBXBuildFile; fileRef = {source};')
        source_phase = add(name + 'sources', f'isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = {array([build])}; runOnlyForDeploymentPostprocessing = 0;')
        framework_phase = add(name + 'frameworks', 'isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = (); runOnlyForDeploymentPostprocessing = 0;')
        configs = []
        for config in ('Debug', 'Release'):
            bundle = 'org.learningcompanion.playgroundruntime.uitests' if is_test else BUNDLES[name]
            info_settings = ('GENERATE_INFOPLIST_FILE = YES; TEST_TARGET_NAME = R3Candidate;'
                             if is_test else f'GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = {name}/Info.plist;')
            settings = f'''
                CODE_SIGNING_ALLOWED = NO;
                CODE_SIGNING_REQUIRED = NO;
                {info_settings}
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
                LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks @loader_path/Frameworks";
            '''
            configs.append(add(name + config, f'isa = XCBuildConfiguration; buildSettings = {{ {settings} }}; name = {config};'))
        config_list = add(name + 'configs', f'isa = XCConfigurationList; buildConfigurations = {array(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
        dependencies = []
        if is_test:
            proxy = add('testproxy', f'isa = PBXContainerItemProxy; containerPortal = {uid("project")}; proxyType = 1; remoteGlobalIDString = {uid("R3Candidatetarget")}; remoteInfo = R3Candidate;')
            dependencies.append(add('testdependency', f'isa = PBXTargetDependency; target = {uid("R3Candidatetarget")}; targetProxy = {proxy};'))
        product_type = 'com.apple.product-type.bundle.ui-testing' if is_test else 'com.apple.product-type.application'
        targets.append(add(name + 'target', f'isa = PBXNativeTarget; buildConfigurationList = {config_list}; buildPhases = {array([source_phase, framework_phase])}; buildRules = (); dependencies = {array(dependencies)}; name = {name}; productName = {name}; productReference = {product}; productType = "{product_type}";'))

    product_group = add('products', f'isa = PBXGroup; children = {array(products)}; name = Products; sourceTree = "<group>";')
    main = add('main', f'isa = PBXGroup; children = {array(sources + [product_group])}; sourceTree = "<group>";')
    configs = [add('project' + name, f'isa = XCBuildConfiguration; buildSettings = {{ CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; }}; name = {name};') for name in ('Debug', 'Release')]
    config_list = add('projectconfigs', f'isa = XCConfigurationList; buildConfigurations = {array(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
    attributes = f'LastUpgradeCheck = 2600; TargetAttributes = {{ {uid("RuntimeUITeststarget")} = {{ TestTargetID = {uid("R3Candidatetarget")}; }}; }};'
    root = add('project', f'isa = PBXProject; attributes = {{ {attributes} }}; buildConfigurationList = {config_list}; compatibilityVersion = "Xcode 14.0"; developmentRegion = en; hasScannedForEncodings = 0; knownRegions = (en, Base,); mainGroup = {main}; productRefGroup = {product_group}; projectDirPath = ""; projectRoot = ""; targets = {array(targets)};')
    PROJECT.mkdir(parents=True, exist_ok=True)
    (PROJECT / 'project.pbxproj').write_text('// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {};\n\tobjectVersion = 56;\n\tobjects = {\n' + '\n'.join(objects) + f'\n\t}};\n\trootObject = {root};\n}}\n', encoding='utf-8')

    schemes = PROJECT / 'xcshareddata/xcschemes'
    schemes.mkdir(parents=True, exist_ok=True)

    def reference(name, extension='app'):
        return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{uid(name + "target")}" BuildableName="{name}.{extension}" BlueprintName="{name}" ReferencedContainer="container:PlaygroundRuntime.xcodeproj"/>'

    for name in BUNDLES:
        app = reference(name)
        test = reference('RuntimeUITests', 'xctest')
        test_build = f'<BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">{test}</BuildActionEntry>' if name == 'R3Candidate' else ''
        testables = f'<TestableReference skipped="NO">{test}</TestableReference>' if name == 'R3Candidate' else ''
        (schemes / f'{name}.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2600" version="1.3">
  <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{app}</BuildActionEntry>{test_build}</BuildActionEntries></BuildAction>
  <TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables>{testables}</Testables></TestAction>
  <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{app}</BuildableProductRunnable></LaunchAction>
  <ProfileAction buildConfiguration="Release"><BuildableProductRunnable runnableDebuggingMode="0">{app}</BuildableProductRunnable></ProfileAction>
  <AnalyzeAction buildConfiguration="Debug"/>
  <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
''', encoding='utf-8')
    for name in (PROJECT.name, 'R2Baseline', 'R3Candidate', 'RuntimeUITests'):
        shutil.copytree(BUILD / name, OUT / 'generated-project' / name, dirs_exist_ok=True)
    shutil.copyfile(tests / 'PlaygroundRuntimeTests.swift', OUT / 'PlaygroundRuntimeTests.swift')
    save()


def launch_and_capture(name, device):
    app = DERIVED / 'Build/Products/Debug-iphonesimulator' / f'{name}.app'
    run(name + '-install', ['xcrun', 'simctl', 'install', device, str(app)], timeout=45)
    _, output = run(name + '-launch', ['xcrun', 'simctl', 'launch', device, BUNDLES[name]], timeout=40)
    time.sleep(4)
    pid = int(output.rsplit(':', 1)[-1].strip())
    _, processes = run(name + '-processes', ['xcrun', 'simctl', 'spawn', device, 'launchctl', 'list'], timeout=30)
    alive = any(parts and parts[0] == str(pid) for parts in (line.split() for line in processes.splitlines()))
    run(name + '-screenshot', ['xcrun', 'simctl', 'io', device, 'screenshot', str(OUT / f'{name}-startup.png')], timeout=30)
    report[name + 'Launch'] = {'pid': pid, 'aliveAfter4Seconds': alive, 'screenshot': f'{name}-startup.png'}
    save()
    if not alive:
        raise RuntimeError(f'{name} did not remain alive for 4 seconds')


device = None
candidate_passed = False
try:
    _, report['xcode'] = run('xcode-version', ['xcodebuild', '-version'], timeout=30)
    _, report['commit'] = run('revision', ['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], timeout=15)
    generate_project()
    _, data = run('simulator-runtimes', ['xcrun', 'simctl', 'list', 'runtimes', '-j'], timeout=30)
    runtimes = [r for r in json.loads(data)['runtimes'] if r.get('isAvailable') and 'iOS' in r['identifier']]
    runtimes.sort(key=lambda r: (r.get('version') == '26.5', tuple(int(x) for x in r.get('version', '0').split('.'))), reverse=True)
    if not runtimes:
        raise RuntimeError('No available iOS Simulator runtime')
    runtime = runtimes[0]
    _, data = run('simulator-device-types', ['xcrun', 'simctl', 'list', 'devicetypes', '-j'], timeout=30)
    types = [t for t in json.loads(data)['devicetypes'] if 'iPad' in t['name']]
    preferred = sorted(types, key=lambda t: ('M5' in t['name'], '13-inch' in t['name'], t['name']), reverse=True)
    for index, ipad in enumerate(preferred):
        created, output = run(f'simulator-create-{index}', ['xcrun', 'simctl', 'create', 'PlaygroundRuntimeProbe', ipad['identifier'], runtime['identifier']], timeout=20, required=False)
        if created:
            device = output.strip()
            report.update(runtime=runtime, simulatedDevice=ipad, simulatorUDID=device)
            break
    if not device:
        raise RuntimeError('No available iPad device type matches the selected runtime')
    run('simulator-boot', ['xcrun', 'simctl', 'boot', device], timeout=30)
    run('simulator-bootstatus', ['xcrun', 'simctl', 'bootstatus', device, '-b'], timeout=120)
    base = ['xcodebuild', '-project', str(PROJECT), '-configuration', 'Debug', '-sdk', 'iphonesimulator',
            '-destination', f'platform=iOS Simulator,id={device}', '-derivedDataPath', str(DERIVED),
            'CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO']
    # Preserve independent baseline evidence even when candidate build/UI test fails.
    baseline_built, _ = run('R2Baseline-build', base + ['-scheme', 'R2Baseline', 'build'], timeout=180, required=False)
    if baseline_built:
        try:
            launch_and_capture('R2Baseline', device)
        except Exception as exc:
            report['baselineError'] = str(exc)
            save()
        finally:
            run('R2Baseline-terminate', ['xcrun', 'simctl', 'terminate', device, BUNDLES['R2Baseline']], timeout=20, required=False)
    else:
        report['baselineError'] = 'Build failed; see R2Baseline-build.log'
        save()
    candidate_built, _ = run('R3Candidate-build', base + ['-scheme', 'R3Candidate', 'build-for-testing'], timeout=240, required=False)
    if candidate_built:
        launch_and_capture('R3Candidate', device)
        candidate_passed, _ = run('R3Candidate-ui-test', base + [
            '-scheme', 'R3Candidate', '-resultBundlePath', str(RESULT),
            '-parallel-testing-enabled', 'NO', '-maximum-concurrent-test-simulator-destinations', '1',
            '-test-timeouts-enabled', 'YES', '-default-test-execution-time-allowance', '60',
            '-maximum-test-execution-time-allowance', '90', 'test-without-building'], timeout=180, required=False)
        report['candidateUITest'] = 'PASS' if candidate_passed else 'FAIL'
    else:
        report['candidateUITest'] = 'NOT_RUN_BUILD_FAILED'
except Exception as exc:
    report['error'] = str(exc)
    print(str(exc), flush=True)
finally:
    if RESULT.exists():
        run('xcresult-summary', ['xcrun', 'xcresulttool', 'get', 'test-results', 'summary', '--path', str(RESULT)], timeout=30, required=False)
        run('xcresult-attachments', ['xcrun', 'xcresulttool', 'export', 'attachments', '--path', str(RESULT), '--output-path', str(OUT / 'ui-attachments')], timeout=40, required=False)
    if device:
        run('simulator-app-log', ['xcrun', 'simctl', 'spawn', device, 'log', 'show', '--last', '10m', '--style', 'compact', '--predicate', 'process == "R2Baseline" OR process == "R3Candidate"'], timeout=30, required=False)
        subprocess.run(['xcrun', 'simctl', 'shutdown', device], capture_output=True, timeout=30)
    report['candidateStartupAndCanvasControls'] = 'PASS' if candidate_passed else 'FAIL'
    save()

raise SystemExit(0 if candidate_passed else 1)
