import SwiftUI

@main
struct CompanionInkApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @StateObject private var store = InkStore(page: PracticePage.current.context)
    @State private var mode: InputMode = .nav
    @State private var tool: InkTool = .pen
    @State private var fingerInk = false

    private let page = PracticePage.current

    var body: some View {
        VStack(spacing: 0) {
            controls
            Divider()
            ScrollView([.horizontal, .vertical]) {
                ZStack(alignment: .topLeading) {
                    PageView(page: page)
                    InkCanvas(
                        initialDrawing: store.drawing,
                        isWriting: mode == .write,
                        tool: tool,
                        fingerInk: fingerInk,
                        onChange: { store.save($0) }
                    )
                }
                .frame(width: PracticePage.size.width, height: PracticePage.size.height)
                .padding()
            }
            .scrollBounceBehavior(.basedOnSize, axes: [.horizontal, .vertical])
            Divider()
            statusBar
        }
    }

    private var controls: some View {
        HStack(spacing: 16) {
            Picker("Input mode", selection: $mode) {
                ForEach(InputMode.allCases) { option in
                    Text(option.rawValue).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 280)

            if mode == .write {
                Picker("Tool", selection: $tool) {
                    Text("Pen").tag(InkTool.pen)
                    Text("Eraser").tag(InkTool.eraser)
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 200)

                Toggle("Finger ink", isOn: $fingerInk)
                    .fixedSize()
            }
            Spacer()
        }
        .padding()
    }

    private var statusBar: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(modeHint)
                .font(.callout)
            Text(store.status)
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text("Page \(page.id) v\(page.version): a bundled practice page, not a captured course page.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
    }

    private var modeHint: String {
        switch mode {
        case .nav:
            return "NAV: read and scroll the page. Ink is off."
        case .write:
            return fingerInk
                ? "WRITE: Apple Pencil and fingers both write (finger ink is on)."
                : "WRITE: Apple Pencil writes; fingers scroll."
        case .ask:
            return "ASK: AI help is not connected in this build. Nothing was selected or sent."
        }
    }
}

/// The page is laid out at a fixed size with fixed font sizes, so text positions, and the
/// ink written over them, do not move between devices, windows or text-size settings.
struct PageView: View {
    let page: PracticePage

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text(page.title)
                .font(.system(size: 26, weight: .bold))
            Text(page.body)
                .font(.system(size: 20, design: .serif))
            Spacer()
        }
        .padding(40)
        .frame(width: PracticePage.size.width, height: PracticePage.size.height, alignment: .topLeading)
        .foregroundStyle(Color.black)
        .background(Color.white)
        .border(Color.gray.opacity(0.4))
    }
}
