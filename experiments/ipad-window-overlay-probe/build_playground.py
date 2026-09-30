"""Build the explicitly host-limited, cable-free variant; never alter native sources."""
from pathlib import Path
import hashlib
import json
import zipfile

BASE = Path(__file__).resolve().parent
OUT = BASE / "playground"
APP = OUT / "GlassPlayground.swiftpm"
APP.joinpath("Sources").mkdir(parents=True, exist_ok=True)

original = (BASE / "Sources/GlassProbe.swift").read_text(encoding="utf-8")
body = original[original.index("private enum ProbeMode"):]
start = body.index("final class GlassWindow: UIWindow")
end = body.index("private final class GlassRootView: UIView")
body = body[:start] + body[end:]
body = body.replace('"window_or_root_filtered_hit_tests", "window_pencil_touch_samples",\n        "window_pencil_began_samples", "window_direct_touch_samples",\n        "window_direct_began_samples", "window_indirect_pointer_touch_samples",\n        "window_indirect_pointer_began_samples", "window_other_touch_samples",\n        "window_other_began_samples", "drawing_change_callbacks"', '"drawing_change_callbacks"')
body = body.replace('private var lastGeometry: String?', 'private var lastGeometry: String?\n    private var hostSignature = "not_attached"')
body = body.replace('super.viewDidAppear(animated)\n', 'super.viewDidAppear(animated)\n        publishHostStatus("界面已出现")\n')
body = body.replace('super.viewDidLayoutSubviews()\n', 'super.viewDidLayoutSubviews()\n        clearOwnHostBackgrounds()\n')
marker = '    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {'
method = '''    // This touches only this app's ancestors. The OS compositor remains in control.
    // Start opaque. Touch host backgrounds only after an explicit transparency choice.
    private func clearOwnHostBackgrounds() {
        guard !state.solidBackground, let window = view.window else { return }
        var names: [String] = []
        var ancestor = view.superview
        while let current = ancestor {
            if current.backgroundColor != UIColor.clear { current.backgroundColor = .clear }
            if current.isOpaque { current.isOpaque = false }
            names.append(String(describing: type(of: current)))
            ancestor = current.superview
        }
        if window.backgroundColor != UIColor.clear { window.backgroundColor = .clear }
        if window.isOpaque { window.isOpaque = false }
        let signature = names.joined(separator: " > ")
        if signature != hostSignature {
            hostSignature = signature
            state.record("playground_host_attached", details: [
                "ancestorTypes": names,
                "windowType": String(describing: type(of: window)),
                "customGlassWindowInstalled": false
            ])
        }
    }

'''
assert marker in body
body = body.replace(marker, method + marker)
old_status = 'statusLabel.text = "\\(state.mode.rawValue) · 笔划 \\(glass.canvas.drawing.strokes.count) · Pencil 样本 \\(state.counters["window_pencil_touch_samples", default: 0])\\n仅实验；穿透未保证。墨迹仅本次会话，退出不保存。"'
assert old_status in body
body = body.replace(old_status, 'statusLabel.text = "无线预实验 R3 · \\(state.mode.rawValue) · 笔划 \\(glass.canvas.drawing.strokes.count)\\n运行在 Playground；透明/穿透待观察。墨迹退出不保存。"')
body = body.replace('"probe": "UIKit Glass Window Probe",', '''"probe": "Swift Playground Glass View Probe",
            "hostScope": [
                "entry": "SwiftUI WindowGroup + UIViewControllerRepresentable",
                "requiresManualRunAppNotPreview": true,
                "signedStandaloneAppTested": false,
                "customGlassWindowInstalled": false,
                "windowSendEventSamples": "NOT_AVAILABLE_IN_THIS_HOST",
                "ancestorTypesAtLastLayout": hostSignature,
                "negativeResultScope": "This Playground host path only; not all standalone apps"
            ],''')
body = body.replace('"Window touch samples only describe events delivered to this app window, including its controls.",', '"There are no custom UIWindow sendEvent samples in this Playground variant.",\n                "The SwiftUI/Playground host may consume touches rejected by the root view.",\n                "A negative result in this host does not rule out a separately installed native app.",')
body = body.replace('另一 App 的点击计数或滚动位置实际改变。', '另一 App 的点击计数或滚动位置实际改变；可观察时钟的“计次”新增一行。')
body = body.replace('请观察另一 App 的实时计数、点击或滚动后记录。', '请用时钟秒表等另一 App 观察。只有运行窗口里的实测才记结果；编辑器预览不算。')

# Show a pure SwiftUI landing page before allocating PencilKit, then give the
# bridge explicit size and start with an opaque positive control.
body = body.replace('fileprivate var solidBackground = false', 'fileprivate var solidBackground = true')
body = body.replace('backgroundControl.selectedSegmentIndex = 0', 'backgroundControl.selectedSegmentIndex = 1\n        glass.backgroundColor = .systemYellow\n        glass.controls.accessibilityIdentifier = "probe.canvasControls"')
body = body.replace('    private let state: ProbeState\n', '    private let state: ProbeState\n    var onHostStatus: ((String) -> Void)?\n    private var lastHostStatus: String?\n')
body = body.replace('        state.record("probe_started", details: settings())', '        publishHostStatus("画布已加载")\n        state.record("probe_started", details: settings())')
body = body.replace('        let geometry = NSCoder.string(for: view.bounds)', '        publishHostStatus("画布布局")\n        let geometry = NSCoder.string(for: view.bounds)')
body = body.replace('        // Keep alpha at 1: making the whole view transparent also hides ink.', '        clearOwnHostBackgrounds()\n        // Keep alpha at 1: making the whole view transparent also hides ink.')
status_method = '''    private func publishHostStatus(_ phase: String) {
        let rootSize = glass.bounds.size
        let controlsSize = glass.controls.bounds.size
        let rootLabel = String(format: "%.0f×%.0f", Double(rootSize.width), Double(rootSize.height))
        let controlsLabel = String(format: "%.0f×%.0f", Double(controlsSize.width), Double(controlsSize.height))
        let message = "\\(phase) · 画布 \\(rootLabel) · 工具条 \\(controlsLabel)"
        guard message != lastHostStatus else { return }
        lastHostStatus = message
        DispatchQueue.main.async { [weak self] in self?.onHostStatus?(message) }
    }

'''
body = body.replace(marker, status_method + marker)

# Keep the report schema but bound Swift's type inference per assignment. The
# earlier mixed nested literal is the leading candidate for the reported timeout.
# UI, drawing and window routing are deliberately unchanged.
report_start = body.index('        let observations: [[String: Any]] = state.observations.map {')
report_end = body.index('        do {\n            let data = try JSONSerialization.data', report_start)
body = body[:report_start] + '''        var observations: [[String: Any]] = []
        for observation in state.observations {
            var item: [String: Any] = [:]
            item["key"] = observation.key
            item["criterion"] = observation.criterion
            item["result"] = observation.result
            if let recordedAt = observation.recordedAt {
                item["recordedAt"] = recordedAt
            } else {
                item["recordedAt"] = NSNull()
            }
            item["note"] = observation.note
            item["settingsAtObservation"] = observation.settingsAtObservation
            item["evidenceSource"] = "manual_user_observation"
            observations.append(item)
        }

        var hostInfo: [String: Any] = [:]
        hostInfo["entry"] = "SwiftUI WindowGroup + UIViewControllerRepresentable"
        hostInfo["requiresManualRunAppNotPreview"] = true
        hostInfo["signedStandaloneAppTested"] = false
        hostInfo["customGlassWindowInstalled"] = false
        hostInfo["windowSendEventSamples"] = "NOT_AVAILABLE_IN_THIS_HOST"
        hostInfo["ancestorTypesAtLastLayout"] = hostSignature
        hostInfo["negativeResultScope"] = "This Playground host path only; not all standalone apps"

        var deviceInfo: [String: Any] = [:]
        deviceInfo["model"] = UIDevice.current.model
        deviceInfo["hardwareIdentifier"] = hardwareIdentifier()
        deviceInfo["systemName"] = UIDevice.current.systemName
        deviceInfo["systemVersion"] = UIDevice.current.systemVersion
        deviceInfo["osBuildDescription"] = ProcessInfo.processInfo.operatingSystemVersionString

        var bundleInfo: [String: Any] = [:]
        bundleInfo["identifier"] = Bundle.main.bundleIdentifier ?? "unknown"
        bundleInfo["version"] = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "unknown"
        bundleInfo["build"] = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "unknown"

        var sceneInfo: [String: Any] = [:]
        sceneInfo["sessionIdentifier"] = scene?.session.persistentIdentifier ?? "unknown"
        sceneInfo["activationState"] = "unknown"
        sceneInfo["interfaceOrientationRawValue"] = -1
        if let scene = scene {
            sceneInfo["activationState"] = String(describing: scene.activationState)
            sceneInfo["interfaceOrientationRawValue"] = scene.interfaceOrientation.rawValue
        }
        sceneInfo["windowBounds"] = [String: Double]()
        sceneInfo["windowFrame"] = [String: Double]()
        sceneInfo["screenBounds"] = [String: Double]()
        if let window = window {
            sceneInfo["windowBounds"] = rect(window.bounds)
            sceneInfo["windowFrame"] = rect(window.frame)
        }
        if let screen = screen {
            sceneInfo["screenBounds"] = rect(screen.bounds)
        }
        sceneInfo["screenScale"] = screen?.scale ?? 0
        sceneInfo["windowLevel"] = window?.windowLevel.rawValue ?? 0
        sceneInfo["isKeyWindow"] = window?.isKeyWindow ?? false

        var drawingInfo: [String: Any] = [:]
        drawingInfo["strokeCount"] = glass.canvas.drawing.strokes.count
        drawingInfo["dataByteCount"] = glass.canvas.drawing.dataRepresentation().count
        drawingInfo["canUndo"] = glass.canvas.undoManager?.canUndo ?? false
        drawingInfo["canRedo"] = glass.canvas.undoManager?.canRedo ?? false
        drawingInfo["persistence"] = "session_only_not_saved"

        let interpretation: [String] = [
            "hitTest counts are routing attempts; UIKit may call hitTest repeatedly for one touch.",
            "There are no custom UIWindow sendEvent samples in this Playground variant.",
            "The SwiftUI/Playground host may consume touches rejected by the root view.",
            "A negative result in this host does not rule out a separately installed native app.",
            "Returning nil does not prove delivery to another app or process.",
            "Unknown/mixed input falls back to normal canvas routing; it is not classified as passed through.",
            "Pencil-only drawing is not a guarantee of finger pass-through.",
            "Manual results can refer to earlier settings; see timestamped history.",
            "No screen capture, network request, upload, or drawing persistence is performed by this probe."
        ]
        var report: [String: Any] = [:]
        report["schemaVersion"] = 1
        report["probe"] = "Swift Playground Glass View Probe"
        report["hostScope"] = hostInfo
        report["startedAt"] = state.startedAt
        report["exportedAt"] = ProbeState.timestamp()
        report["device"] = deviceInfo
        report["bundle"] = bundleInfo
        report["scene"] = sceneInfo
        report["settings"] = settings()
        report["counters"] = state.counters
        report["drawing"] = drawingInfo
        report["manualObservations"] = observations
        report["history"] = state.history
        report["interpretation"] = interpretation
''' + body[report_end:]

entry = '''import SwiftUI
import UIKit
import PencilKit
import Darwin

// Run with the top Run App button in Swift Playground, not just its live preview.
@main
struct GlassPlaygroundApp: App {
    var body: some Scene {
        WindowGroup {
            ProbeStartupView()
        }
    }
}

private struct ProbeStartupView: View {
    @State private var canvasVisible = false
    @State private var hostStatus = "启动页已显示"

    var body: some View {
        VStack(spacing: 0) {
            Text("透明画笔 R3 · " + hostStatus)
                .font(.headline)
                .foregroundColor(.white)
                .lineLimit(2)
                .padding(12)
                .frame(maxWidth: .infinity)
                .frame(height: 64)
                .background(Color.blue)
                .accessibilityIdentifier("probe.startupBanner")
            if canvasVisible {
                GeometryReader { geometry in
                    GlassPlaygroundHost(onStatus: { hostStatus = $0 })
                        .frame(width: geometry.size.width, height: geometry.size.height)
                }
            } else {
                VStack(spacing: 24) {
                    Text("启动成功")
                        .font(.largeTitle)
                        .foregroundColor(.primary)
                    Text("先打开黄色画布，确认笔和橡皮能用，再尝试透明。")
                        .foregroundColor(.primary)
                        .multilineTextAlignment(.center)
                    Button("打开画布") {
                        hostStatus = "正在打开画布"
                        canvasVisible = true
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("probe.openCanvas")
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(UIColor.systemBackground))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct GlassPlaygroundHost: UIViewControllerRepresentable {
    var onStatus: (String) -> Void

    func makeUIViewController(context: Context) -> GlassViewController {
        let controller = GlassViewController(state: ProbeState())
        controller.onHostStatus = onStatus
        return controller
    }

    func updateUIViewController(_ controller: GlassViewController, context: Context) {
        controller.onHostStatus = onStatus
    }
}

'''
source = entry + body
assert source.count("@main") == 1
assert "class GlassWindow" not in source
assert "window_pencil_touch_samples" not in source
assert "UIApplicationDelegate" not in source
APP.joinpath("Sources/GlassProbe.swift").write_text(source, encoding="utf-8")
APP.joinpath("Package.swift").write_text('''// swift-tools-version: 5.7
import PackageDescription
import AppleProductTypes

let package = Package(
    name: "GlassPlaygroundR3",
    platforms: [.iOS("16.0")],
    products: [
        .iOSApplication(
            name: "GlassPlayground R3",
            targets: ["AppModule"],
            bundleIdentifier: "local.learningcompanion.GlassPlaygroundR3",
            displayVersion: "1.2",
            bundleVersion: "3",
            appIcon: .placeholder(icon: .pencil),
            accentColor: .presetColor(.blue),
            supportedDeviceFamilies: [.pad],
            supportedInterfaceOrientations: [
                .portrait, .landscapeLeft, .landscapeRight,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [.executableTarget(name: "AppModule", path: "Sources")],
    swiftLanguageVersions: [.v5]
)
''', encoding="utf-8")

guide = '''透明画笔：无线初步实验 R3
====================

R3 先显示独立启动页，点“打开画布”才创建画布，并显示画布和工具条尺寸。
默认黄色实底，直到主动点“透明”才尝试清除本窗口背景。
沿用 R2 的导出报告表达式拆分。顶部应出现蓝色的“透明画笔 R3”。

你现在需要的：iPad、Swift Playground（Apple 出品，免费）、Apple Pencil（如有）。
不需要数据线，不需要购买开发者会员，不需要安装 Sideloadly 或 TestFlight。
本包是源码工程；本次新宿主版本尚未在 iPad 编译或运行，不是已验证的成品安装包。
旧的独立 IPA 曾经构建通过，不等于本版本通过。

一、先把工程放到 iPad
1. 在 iPad App Store 下载 Swift Playground，认准开发者 Apple。
   https://apps.apple.com/us/app/swift-playground/id908519492
2. 把 GlassPlayground-R3-iPad.zip 从电脑传给自己：
   可用微信“文件传输助手”，或者上传到自己的 iCloud Drive。
   本次没有自动向任何账号发送或上传文件。
3. 在 iPad 保存到“文件”App，然后轻点 ZIP 解压。
4. 打开解压目录里的 GlassPlayground.swiftpm。
   若只是进入目录：长按它→共享→选择 Swift Playground。
   也可从 Swift Playground 的文件浏览器打开这个工程。
   不要逐个打开里面的 .swift 文件，不要打开以前的 .ipa。
5. 等载入完，点代码区上方的 ▶ Run App（运行 App）。
   应当出现单独运行窗口，顶部蓝色“透明画笔 R3”，中间“启动成功”和“打开画布”。
   点“打开画布”后应出现黄色画布和“笔 / 橡皮 / 导航”工具条。
   仅放大右边编辑器预览不算。报编译错误或无法打开，停在这一处，记下原文。

二、先试画笔（1 分钟）
1. 点“打开画布”：应显示黄色画布和工具条；若没有，截取顶部状态条和画面。
2. 选“笔”，用 Pencil 写 123；选“橡皮”擦一部分，再点撤销、重做。
3. 没有 Pencil，可开“手指画正控”确认基本画布能用；只记录手指结果。
   手指能画不代表 Pencil 验收通过。真正测 Pencil 时关掉手指画正控。
4. 本实验墨迹退出不保存，请只写测试内容。

三、试另一 App 是否真的透出来（1 分钟）
1. 打开 iPad 自带“时钟”→“秒表”→“开始”。
2. 先直接点一次“计次/Lap”，确认新增记录；这是底层能响应的对照。
3. 在设置→多任务与手势中选择“窗口化 App”（如果当前尚未开启）。
4. 把实验的【运行窗口】缩小，叠在秒表上方；让画布盖住秒数，而不是让秒数从旁边露出。
5. 在实验里切回“透明”。观察被覆盖位置：能否看到秒数持续变化？
   白底、黑底、桌面壁纸、只露出窗外部分都不算透明成功。
   如果无法形成重叠窗口，记录“未测试：窗口模式未能设置”。

四、试手指是否真的传给下层（1 分钟）
1. 将实验画布盖住时钟的“计次/Lap”按钮，避开实验自己的工具条。
2. 在实验里点“导航”，再用手指点被盖住的 Lap 按钮。
3. 只有时钟实际新增计次，才记“底层收到点击”。
   没落墨、没有反应、实验内部计数变化都不能证明穿透。
4. 同时观察点底下之后：实验窗口是否退到后面，刚才的笔迹是否消失/被遮住？
5. 仅在前三项都清楚后再试“笔”模式＋“手指穿透候选：开”：
   Pencil 写画，抬笔，再用手指点 Lap。两项分别记录。
6. 若窗口菜单提供 Enter Slide Over/进入侧拉，可以额外试置顶；没有就记未测试。

五、把这四个结果告诉我
能写能擦：Pencil / 手指 / 不能 / 未测试
覆盖区域看到秒表持续变化：能 / 黑底 / 白底 / 其他 / 未测试
导航模式点穿后新增计次：能 / 不能 / 未测试
点底下后画笔还留在上面：是 / 否 / 未测试
也可点“报告”，逐项填实际观察，再导出 JSON。不要把没测到的填成通过。

判断边界
- 这是 Swift Playground 宿主中的初步实验，不是已签名独立 App。
- 本版本沿用 PencilKit 画布，但不安装独立版自定义 GlassWindow；窗口级触摸采样不可用。
- RootView 返回 nil 只说明该视图拒绝触摸，SwiftUI 宿主或系统仍可能接住。
- 清空自己的背景不等于系统会把另一 App 合成出来。
- 黑底或点不穿，只能说明此宿主路径未通过；不能证明所有独立 App 方案无解。
- 若看见和点穿成功，也要分别复核层级、Pencil、全屏覆盖及独立安装路径。
- 本次不接 AI、不读取屏幕、不采集音频，不代表学习助手的全屏共享已实现。

苹果参考
Run App 会单独运行窗口（和扩展预览不同）：
https://support.apple.com/en-ph/guide/playgrounds-ipad/itc650868b1f/ipados
时钟秒表与计次：
https://support.apple.com/en-gb/guide/ipad/ipad2f9067d6/ipados
'''
OUT.joinpath("开始实验.txt").write_text(guide, encoding="utf-8-sig")
# Fallback if the iPad's document importer cannot recognise a transferred bundle.
# Replace MyApp.swift in a newly created blank App; its unused ContentView may remain.
OUT.joinpath("单文件备用-替换MyApp.swift.txt").write_text(source, encoding="utf-8-sig")

archive = BASE / "delivery/GlassPlayground-R3-iPad.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.rglob("*")):
        if f.is_file():
            z.write(f, f.relative_to(OUT))

receipt = {
    "format": "Swift Playground app .swiftpm source bundle",
    "revision": "R3",
    "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
    "native_source_sha256": hashlib.sha256(original.encode()).hexdigest(),
    "zip_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
    "archive": archive.name,
    "entry_points": source.count("@main"),
    "native_source_modified": False,
    "custom_window_installed": False,
    "window_event_sampling": "not_available",
    "compiled_in_apple_environment": False,
    "physical_device_tested": False,
    "transferred_to_ipad": False,
    "cross_app_transparency": "not_tested",
    "cross_app_touch_delivery": "not_tested",
    "claims": "Packaging and review only; existing native binary results do not cover this host."
}
compiler_record = BASE / "evidence/playground-r2-compile/playground-typecheck.json"
if compiler_record.exists():
    compiler = json.loads(compiler_record.read_text(encoding="utf-8"))
    checks = [c for c in compiler.get("checks", []) if c["name"].startswith("candidate-")]
    if len(checks) == 2 and all(c["passed"] and c["source_sha256"] == receipt["source_sha256"] for c in checks):
        receipt["apple_sdk_typecheck_passed"] = True
        receipt["apple_sdk_typecheck_targets"] = [c["target"] for c in checks]
        receipt["compiler_evidence"] = "playground-r2-compile/playground-typecheck.json"
        receipt["compiler_evidence_commit"] = compiler["commit"]
        receipt["baseline_diagnostic_reproduced_in_cloud"] = compiler["baseline_diagnostic_reproduced"]
        receipt["app_bundle_built"] = False
        receipt["playground_host_build_verified"] = False
        receipt["claims"] = "Exact source passed Apple iOS device/simulator SDK type checking. Old source also passed in cloud; the user's Playground diagnostic was not reproduced. Actual Playground build and device launch still require verification."
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    packaged_source = z.read("GlassPlayground.swiftpm/Sources/GlassProbe.swift")
    assert hashlib.sha256(packaged_source).hexdigest() == receipt["source_sha256"]
    receipt["archive_crc_verified"] = True
    receipt["packaged_file_count"] = len(z.namelist())
OUT.parent.joinpath("evidence/playground-package.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
print(json.dumps(receipt, indent=2))
