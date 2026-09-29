import UIKit

@main
final class BackdropAppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Backdrop", sessionRole: session.role)
        configuration.delegateClass = BackdropSceneDelegate.self
        return configuration
    }
}

final class BackdropSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = BackdropViewController()
        window.makeKeyAndVisible()
        self.window = window
    }
}

final class BackdropViewController: UIViewController {
    private let clockLabel = UILabel()
    private let countLabel = UILabel()
    private let statusLabel = UILabel()
    private var timer: Timer?
    private var taps = 0
    private var tick = 0
    private let launched = Date()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.92, green: 0.97, blue: 1, alpha: 1)
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 20
        stack.isLayoutMarginsRelativeArrangement = true
        stack.layoutMargins = UIEdgeInsets(top: 20, left: 24, bottom: 24, right: 24)
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor)
        ])

        let title = label("底层测试 App · Backdrop", size: 30)
        stack.addArrangedSubview(title)
        stack.addArrangedSubview(label("先直接点下面的按钮，确认计数增加。再把 GlassProbe 叠上来，在被覆盖的位置重复点击。", size: 19))
        clockLabel.font = .monospacedDigitSystemFont(ofSize: 28, weight: .bold)
        clockLabel.numberOfLines = 0
        clockLabel.accessibilityIdentifier = "backdrop.clock"
        stack.addArrangedSubview(clockLabel)
        countLabel.font = .monospacedDigitSystemFont(ofSize: 30, weight: .bold)
        countLabel.numberOfLines = 0
        countLabel.accessibilityIdentifier = "backdrop.count"
        stack.addArrangedSubview(countLabel)
        statusLabel.font = .systemFont(ofSize: 15)
        statusLabel.numberOfLines = 0
        stack.addArrangedSubview(statusLabel)

        for index in 1...6 {
            let button = UIButton(type: .system)
            var config = UIButton.Configuration.filled()
            config.title = "点这里：底层计数 +1（区域 \(index)）"
            config.baseBackgroundColor = index.isMultiple(of: 2) ? .systemIndigo : .systemBlue
            config.contentInsets = NSDirectionalEdgeInsets(top: 24, leading: 12, bottom: 24, trailing: 12)
            button.configuration = config
            button.accessibilityIdentifier = "backdrop.increment.\(index)"
            button.addAction(UIAction { [weak self] _ in
                self?.taps += 1
                self?.update()
            }, for: .touchUpInside)
            stack.addArrangedSubview(button)
            stack.addArrangedSubview(label("滚动标记 \(index) ／ 6\n可见计时器变化 = 底层仍刷新。计数增加 = 底层实际收到点击。两者必须分开判断。", size: 18))
        }
        stack.addArrangedSubview(label("本 App 是独立进程，无网络、相机、麦克风或屏幕读取。退出后计数归零。", size: 16))
        update()
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick += 1
            self?.update()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    private func label(_ text: String, size: CGFloat) -> UILabel {
        let label = UILabel()
        label.text = text
        label.numberOfLines = 0
        label.font = .systemFont(ofSize: size)
        label.textColor = .label
        return label
    }

    private func update() {
        let seconds = Int(Date().timeIntervalSince(launched))
        clockLabel.text = "\(tick.isMultiple(of: 2) ? "●" : "○") 已运行 \(seconds) 秒 · 刷新 \(tick) 次"
        clockLabel.textColor = tick.isMultiple(of: 2) ? .systemBlue : .systemRed
        countLabel.text = "底层收到点击：\(taps)"
        statusLabel.text = "\(Bundle.main.bundleIdentifier ?? "unknown")\n进程 \(ProcessInfo.processInfo.processIdentifier) · iPadOS \(UIDevice.current.systemVersion)"
    }

    deinit { timer?.invalidate() }
}
