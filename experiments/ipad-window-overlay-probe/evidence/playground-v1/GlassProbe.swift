import SwiftUI
import UIKit
import PencilKit
import Darwin

// Run with the top Run App button in Swift Playground, not just its live preview.
@main
struct GlassPlaygroundApp: App {
    var body: some Scene {
        WindowGroup {
            GlassPlaygroundHost().ignoresSafeArea()
        }
    }
}

private struct GlassPlaygroundHost: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GlassViewController {
        GlassViewController(state: ProbeState())
    }

    func updateUIViewController(_ controller: GlassViewController, context: Context) {}
}

private enum ProbeMode: String {
    case write = "WRITE", erase = "ERASE", navigate = "NAV"
}

private enum TouchClassification: String {
    case pencil, directOrPointer, mixed, unknown
}

private struct Observation {
    let key: String
    let title: String
    let criterion: String
    var result = "NOT_TESTED"
    var recordedAt: String? = nil
    var note = ""
    var settingsAtObservation: [String: Any] = [:]
}

final class ProbeState {
    fileprivate var mode: ProbeMode = .write
    fileprivate var candidateFingerPassThrough = false
    fileprivate var fingerDrawingPositiveControl = false
    fileprivate var solidBackground = false
    fileprivate var reportedWindowMode = "NOT_RECORDED"
    fileprivate let startedAt = ProbeState.timestamp()
    fileprivate var counters: [String: Int] = Dictionary(uniqueKeysWithValues: [
        "canvas_region_hit_test_calls", "hit_test_pencil", "hit_test_directOrPointer",
        "hit_test_mixed", "hit_test_unknown", "nav_nil_decisions",
        "candidate_finger_nil_decisions", "canvas_nil_results", "canvas_route_results",
        "drawing_change_callbacks"
    ].map { ($0, 0) })
    fileprivate var history: [[String: Any]] = []
    fileprivate var observations: [Observation] = [
        Observation(key: "physical_pencil_write_erase_undo", title: "Pencil 写、擦、撤销",
                    criterion: "已关闭手指画正控，用真实 Apple Pencil 写字、局部擦除、撤销和重做；模拟器鼠标不算通过。"),
        Observation(key: "other_app_live_visible", title: "另一 App 实时可见",
                    criterion: "透过本 App 看见另一个独立 App 的持续变化画面；不是本 App 正控、截图或桌面。"),
        Observation(key: "underlying_app_receives_finger", title: "底层 App 收到手指",
                    criterion: "在本 App 控制条以外的覆盖范围内点击或滑动，另一 App 的点击计数或滚动位置实际改变；可观察时钟的“计次”新增一行。"),
        Observation(key: "ink_stays_above_other_app", title: "笔迹持续在上方",
                    criterion: "在另一 App 点击、滚动或切换焦点后，本 App 的笔迹仍然可见并位于上方。"),
        Observation(key: "full_content_area_coverage", title: "覆盖整个内容区域",
                    criterion: "已实际把本 App 调整到覆盖目标 App 的整个内容区域；小浮窗不算全屏覆盖。")
    ]

    fileprivate func increment(_ key: String, by amount: Int = 1) {
        counters[key, default: 0] += amount
    }

    fileprivate func record(_ name: String, details: [String: Any] = [:]) {
        var entry = details
        entry["event"] = name
        entry["timestamp"] = Self.timestamp()
        entry["systemUptimeSeconds"] = ProcessInfo.processInfo.systemUptime
        history.append(entry)
        if history.count > 500 { history.removeFirst(history.count - 500) }
    }

    fileprivate static func timestamp() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

private final class GlassRootView: UIView {
    let canvas = PKCanvasView()
    let controls = UIView()
    let state: ProbeState

    init(state: ProbeState) {
        self.state = state
        super.init(frame: .zero)
        backgroundColor = .clear
        isOpaque = false
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .pencilOnly
        canvas.isScrollEnabled = false
        canvas.bounces = false
        canvas.minimumZoomScale = 1
        canvas.maximumZoomScale = 1
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.translatesAutoresizingMaskIntoConstraints = false
        controls.translatesAutoresizingMaskIntoConstraints = false
        controls.backgroundColor = UIColor.secondarySystemBackground.withAlphaComponent(0.97)
        controls.layer.cornerRadius = 12
        addSubview(canvas)
        addSubview(controls)
        NSLayoutConstraint.activate([
            canvas.leadingAnchor.constraint(equalTo: leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: trailingAnchor),
            canvas.topAnchor.constraint(equalTo: topAnchor),
            canvas.bottomAnchor.constraint(equalTo: bottomAnchor),
            controls.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 8),
            controls.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -8),
            controls.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 6)
        ])
    }

    required init?(coder: NSCoder) { fatalError("Use init(state:)") }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard !isHidden, alpha >= 0.01, isUserInteractionEnabled,
              self.point(inside: point, with: event) else { return nil }
        // The compact control panel stays interactive in every mode.
        let controlPoint = controls.convert(point, from: self)
        if controls.point(inside: controlPoint, with: event) {
            return controls.hitTest(controlPoint, with: event)
        }

        state.increment("canvas_region_hit_test_calls")
        let classification = classify(event)
        state.increment("hit_test_\(classification.rawValue)")
        if state.mode == .navigate {
            state.increment("nav_nil_decisions")
            return nil
        }
        if state.candidateFingerPassThrough && classification == .directOrPointer {
            state.increment("candidate_finger_nil_decisions")
            return nil
        }
        // nil events and mixed/unsupported touch sets are not asserted to be
        // fingers. Preserve normal PencilKit routing and record the uncertainty.
        let result = canvas.hitTest(canvas.convert(point, from: self), with: event)
        state.increment(result == nil ? "canvas_nil_results" : "canvas_route_results")
        return result
    }

    private func classify(_ event: UIEvent?) -> TouchClassification {
        guard let event = event, event.type == .touches,
              let touches = event.allTouches, !touches.isEmpty else { return .unknown }
        var hasPencil = false
        var hasDirectOrPointer = false
        var hasOther = false
        for touch in touches {
            switch touch.type {
            case .pencil: hasPencil = true
            case .direct, .indirectPointer: hasDirectOrPointer = true
            default: hasOther = true
            }
        }
        if hasOther { return (hasPencil || hasDirectOrPointer) ? .mixed : .unknown }
        if hasPencil && hasDirectOrPointer { return .mixed }
        return hasPencil ? .pencil : .directOrPointer
    }
}

private final class GlassViewController: UIViewController, PKCanvasViewDelegate {
    private let state: ProbeState
    private var glass: GlassRootView { view as! GlassRootView }
    private let modeControl = UISegmentedControl(items: ["笔", "橡皮", "导航"])
    private let backgroundControl = UISegmentedControl(items: ["透明", "实底正控"])
    private let statusLabel = UILabel()
    private let candidateButton = UIButton(type: .system)
    private let fingerButton = UIButton(type: .system)
    private let reportButton = UIButton(type: .system)
    private let undoButton = UIButton(type: .system)
    private let redoButton = UIButton(type: .system)
    private var statusTimer: Timer?
    private var lastGeometry: String?
    private var hostSignature = "not_attached"

    init(state: ProbeState) {
        self.state = state
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("Use init(state:)") }

    override func loadView() { view = GlassRootView(state: state) }

    override func viewDidLoad() {
        super.viewDidLoad()
        glass.canvas.delegate = self
        glass.canvas.tool = PKInkingTool(.pen, color: .systemRed, width: 4)
        modeControl.selectedSegmentIndex = 0
        backgroundControl.selectedSegmentIndex = 0
        modeControl.addTarget(self, action: #selector(modeChanged), for: .valueChanged)
        backgroundControl.addTarget(self, action: #selector(backgroundChanged), for: .valueChanged)
        configure(undoButton, title: "撤销", action: #selector(undoDrawing))
        configure(redoButton, title: "重做", action: #selector(redoDrawing))
        configure(candidateButton, title: "手指穿透候选：关", action: #selector(toggleCandidate))
        configure(fingerButton, title: "手指画正控：关", action: #selector(toggleFingerDrawing))
        configure(reportButton, title: "报告", action: #selector(showReportMenu))
        reportButton.setContentHuggingPriority(.required, for: .horizontal)
        statusLabel.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        statusLabel.numberOfLines = 0
        statusLabel.textColor = .secondaryLabel

        let row1 = row([modeControl, reportButton])
        let row2 = row([undoButton, redoButton, backgroundControl])
        let row3 = row([candidateButton, fingerButton])
        row3.distribution = .fillEqually
        let stack = UIStackView(arrangedSubviews: [row1, row2, row3, statusLabel])
        stack.axis = .vertical
        stack.spacing = 3
        stack.translatesAutoresizingMaskIntoConstraints = false
        glass.controls.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: glass.controls.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: glass.controls.trailingAnchor, constant: -8),
            stack.topAnchor.constraint(equalTo: glass.controls.topAnchor, constant: 5),
            stack.bottomAnchor.constraint(equalTo: glass.controls.bottomAnchor, constant: -5)
        ])
        state.record("probe_started", details: settings())
        updateStatus()
        statusTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.updateStatus()
        }
    }

    deinit { statusTimer?.invalidate() }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        clearOwnHostBackgrounds()
        if state.mode != .navigate { glass.canvas.becomeFirstResponder() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        clearOwnHostBackgrounds()
        let geometry = NSCoder.string(for: view.bounds)
        if geometry != lastGeometry {
            lastGeometry = geometry
            state.record("view_bounds_changed", details: ["bounds": rect(view.bounds)])
        }
    }

    // This touches only this app's ancestors. The OS compositor remains in control.
    // The SwiftUI/Playground host may still consume touches rejected by GlassRootView.
    private func clearOwnHostBackgrounds() {
        guard let window = view.window else { return }
        var names: [String] = []
        var ancestor = view.superview
        while let current = ancestor {
            current.backgroundColor = .clear
            current.isOpaque = false
            names.append(String(describing: type(of: current)))
            ancestor = current.superview
        }
        window.backgroundColor = .clear
        window.isOpaque = false
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

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        state.increment("drawing_change_callbacks")
    }

    private func configure(_ button: UIButton, title: String, action: Selector) {
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 12, weight: .medium)
        button.titleLabel?.adjustsFontSizeToFitWidth = true
        button.titleLabel?.minimumScaleFactor = 0.75
        button.addTarget(self, action: action, for: .touchUpInside)
    }

    private func row(_ views: [UIView]) -> UIStackView {
        let stack = UIStackView(arrangedSubviews: views)
        stack.axis = .horizontal
        stack.alignment = .fill
        stack.spacing = 7
        return stack
    }

    @objc private func modeChanged() {
        state.mode = [ProbeMode.write, .erase, .navigate][modeControl.selectedSegmentIndex]
        if state.mode == .erase {
            glass.canvas.tool = PKEraserTool(.bitmap)
        } else if state.mode == .write {
            glass.canvas.tool = PKInkingTool(.pen, color: .systemRed, width: 4)
        }
        state.record("mode_changed", details: settings())
        updateStatus()
    }

    @objc private func backgroundChanged() {
        state.solidBackground = backgroundControl.selectedSegmentIndex == 1
        glass.backgroundColor = state.solidBackground ? .systemYellow : .clear
        // Keep alpha at 1: making the whole view transparent also hides ink.
        state.record("background_changed", details: settings())
    }

    @objc private func toggleCandidate() {
        state.candidateFingerPassThrough.toggle()
        if state.candidateFingerPassThrough {
            state.fingerDrawingPositiveControl = false
            glass.canvas.drawingPolicy = .pencilOnly
        }
        state.record("candidate_routing_changed", details: settings())
        updateStatus()
    }

    @objc private func toggleFingerDrawing() {
        state.fingerDrawingPositiveControl.toggle()
        if state.fingerDrawingPositiveControl { state.candidateFingerPassThrough = false }
        glass.canvas.drawingPolicy = state.fingerDrawingPositiveControl ? .anyInput : .pencilOnly
        state.record("finger_positive_control_changed", details: settings())
        updateStatus()
    }

    @objc private func undoDrawing() {
        state.record("undo_requested", details: ["canUndo": glass.canvas.undoManager?.canUndo ?? false])
        glass.canvas.undoManager?.undo()
        updateStatus()
    }

    @objc private func redoDrawing() {
        state.record("redo_requested", details: ["canRedo": glass.canvas.undoManager?.canRedo ?? false])
        glass.canvas.undoManager?.redo()
        updateStatus()
    }

    private func updateStatus() {
        candidateButton.setTitle("手指穿透候选：\(state.candidateFingerPassThrough ? "开" : "关")", for: .normal)
        fingerButton.setTitle("手指画正控：\(state.fingerDrawingPositiveControl ? "开" : "关")", for: .normal)
        undoButton.isEnabled = glass.canvas.undoManager?.canUndo ?? false
        redoButton.isEnabled = glass.canvas.undoManager?.canRedo ?? false
        statusLabel.text = "无线预实验 · \(state.mode.rawValue) · 笔划 \(glass.canvas.drawing.strokes.count)\n运行在 Playground；透明/穿透待观察。墨迹退出不保存。"
    }

    @objc private func showReportMenu() {
        let alert = UIAlertController(title: "记录实际观察", message: "路由计数不代表跨 App 成功。请用时钟秒表等另一 App 观察。只有运行窗口里的实测才记结果；编辑器预览不算。", preferredStyle: .actionSheet)
        for index in state.observations.indices {
            let observation = state.observations[index]
            alert.addAction(UIAlertAction(title: "\(observation.title)：\(resultLabel(observation.result))", style: .default) { [weak self] _ in
                self?.chooseObservation(index)
            })
        }
        alert.addAction(UIAlertAction(title: "记录窗口模式：\(windowModeLabel(state.reportedWindowMode))", style: .default) { [weak self] _ in
            self?.chooseWindowMode()
        })
        alert.addAction(UIAlertAction(title: "导出 JSON 报告", style: .default) { [weak self] _ in
            self?.exportReport()
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentNext(alert)
    }

    private func chooseObservation(_ index: Int) {
        let observation = state.observations[index]
        let alert = UIAlertController(title: observation.title, message: observation.criterion, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "可选：底层 App、操作和看到的结果"
            field.text = observation.note
        }
        for result in ["PASS", "FAIL", "UNKNOWN", "NOT_TESTED"] {
            alert.addAction(UIAlertAction(title: resultLabel(result), style: .default) { [weak self, weak alert] _ in
                guard let self = self else { return }
                self.state.observations[index].result = result
                self.state.observations[index].recordedAt = ProbeState.timestamp()
                self.state.observations[index].note = alert?.textFields?.first?.text ?? ""
                self.state.observations[index].settingsAtObservation = self.settings()
                self.state.record("manual_observation", details: ["key": observation.key, "result": result, "settings": self.settings()])
            })
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentNext(alert)
    }

    private func chooseWindowMode() {
        let alert = UIAlertController(title: "当前系统窗口模式", message: "由你观察填写；本 App 不会自动判定 Slide Over 或 Stage Manager。", preferredStyle: .actionSheet)
        for value in ["FULL_SCREEN", "WINDOWED_APPS", "SLIDE_OVER", "STAGE_MANAGER", "UNKNOWN"] {
            alert.addAction(UIAlertAction(title: windowModeLabel(value), style: .default) { [weak self] _ in
                self?.state.reportedWindowMode = value
                self?.state.record("manual_window_mode", details: ["value": value])
            })
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        presentNext(alert)
    }

    private func resultLabel(_ result: String) -> String {
        switch result {
        case "PASS": return "实测通过"
        case "FAIL": return "实测未通过"
        case "UNKNOWN": return "无法判定"
        default: return "未测试"
        }
    }

    private func windowModeLabel(_ value: String) -> String {
        switch value {
        case "FULL_SCREEN": return "全屏"
        case "WINDOWED_APPS": return "窗口化 App"
        case "SLIDE_OVER": return "Slide Over 浮窗"
        case "STAGE_MANAGER": return "Stage Manager 台前调度"
        case "UNKNOWN": return "无法判定"
        default: return "未记录"
        }
    }

    private func presentNext(_ controller: UIViewController) {
        if let popover = controller.popoverPresentationController {
            popover.sourceView = reportButton
            popover.sourceRect = reportButton.bounds
        }
        if presentedViewController is UIAlertController {
            dismiss(animated: true) { [weak self] in self?.present(controller, animated: true) }
        } else {
            present(controller, animated: true)
        }
    }

    private func settings() -> [String: Any] {
        ["mode": state.mode.rawValue,
         "candidateFingerPassThrough": state.candidateFingerPassThrough,
         "fingerDrawingPositiveControl": state.fingerDrawingPositiveControl,
         "solidBackgroundPositiveControl": state.solidBackground,
         "reportedWindowMode": state.reportedWindowMode,
         "drawingPolicy": state.fingerDrawingPositiveControl ? "anyInput_positive_control" : "pencilOnly"]
    }

    private func exportReport() {
        let window = view.window
        let scene = window?.windowScene
        let screen = scene?.screen
        let observations: [[String: Any]] = state.observations.map {
            ["key": $0.key, "criterion": $0.criterion, "result": $0.result,
             "recordedAt": ($0.recordedAt as Any?) ?? NSNull(), "note": $0.note,
             "settingsAtObservation": $0.settingsAtObservation,
             "evidenceSource": "manual_user_observation"]
        }
        let report: [String: Any] = [
            "schemaVersion": 1,
            "probe": "Swift Playground Glass View Probe",
            "hostScope": [
                "entry": "SwiftUI WindowGroup + UIViewControllerRepresentable",
                "requiresManualRunAppNotPreview": true,
                "signedStandaloneAppTested": false,
                "customGlassWindowInstalled": false,
                "windowSendEventSamples": "NOT_AVAILABLE_IN_THIS_HOST",
                "ancestorTypesAtLastLayout": hostSignature,
                "negativeResultScope": "This Playground host path only; not all standalone apps"
            ],
            "startedAt": state.startedAt,
            "exportedAt": ProbeState.timestamp(),
            "device": ["model": UIDevice.current.model, "hardwareIdentifier": hardwareIdentifier(),
                       "systemName": UIDevice.current.systemName, "systemVersion": UIDevice.current.systemVersion,
                       "osBuildDescription": ProcessInfo.processInfo.operatingSystemVersionString],
            "bundle": ["identifier": Bundle.main.bundleIdentifier ?? "unknown",
                       "version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") ?? "unknown",
                       "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") ?? "unknown"],
            "scene": ["sessionIdentifier": scene?.session.persistentIdentifier ?? "unknown",
                      "activationState": scene.map { String(describing: $0.activationState) } ?? "unknown",
                      "interfaceOrientationRawValue": scene?.interfaceOrientation.rawValue ?? -1,
                      "windowBounds": window.map { rect($0.bounds) } ?? [:],
                      "windowFrame": window.map { rect($0.frame) } ?? [:],
                      "screenBounds": screen.map { rect($0.bounds) } ?? [:],
                      "screenScale": screen?.scale ?? 0,
                      "windowLevel": window?.windowLevel.rawValue ?? 0,
                      "isKeyWindow": window?.isKeyWindow ?? false],
            "settings": settings(),
            "counters": state.counters,
            "drawing": ["strokeCount": glass.canvas.drawing.strokes.count,
                        "dataByteCount": glass.canvas.drawing.dataRepresentation().count,
                        "canUndo": glass.canvas.undoManager?.canUndo ?? false,
                        "canRedo": glass.canvas.undoManager?.canRedo ?? false,
                        "persistence": "session_only_not_saved"],
            "manualObservations": observations,
            "history": state.history,
            "interpretation": [
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
        ]
        do {
            let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("glass-probe-\(UUID().uuidString).json")
            try data.write(to: url, options: .atomic)
            let activity = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            presentNext(activity)
        } catch {
            let alert = UIAlertController(title: "报告导出失败", message: error.localizedDescription, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "好", style: .default))
            presentNext(alert)
        }
    }

    private func rect(_ value: CGRect) -> [String: Double] {
        ["x": Double(value.origin.x), "y": Double(value.origin.y),
         "width": Double(value.width), "height": Double(value.height)]
    }

    private func hardwareIdentifier() -> String {
        var information = utsname()
        uname(&information)
        return Mirror(reflecting: information.machine).children.reduce(into: "") { result, element in
            guard let value = element.value as? Int8, value != 0 else { return }
            result.append(Character(UnicodeScalar(UInt8(bitPattern: value))))
        }
    }
}
