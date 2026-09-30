import AppKit
import DesktopCapture
import SwiftUI

/// The transparent layer exactly over the selected display. Its coordinates are display-local
/// points (flipped: origin top-left, y down). It takes the pointer only in WRITE and ASK.
final class InkOverlayView: NSView {
    private weak var controller: InkController?

    init(controller: InkController) {
        self.controller = controller
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) {
        nil
    }

    override var isFlipped: Bool { true }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    /// The point with its native facts; tablet points keep pressure and tilt. The pen end comes
    /// from the controller's app-level proximity tracking.
    private func input(_ event: NSEvent) -> (point: InkPoint, device: InkDevice) {
        let location = convert(event.locationInWindow, from: nil)
        let tablet = event.subtype == .tabletPoint
        let point = InkPoint(x: Double(location.x), y: Double(location.y), eventTime: event.timestamp,
                             pressure: tablet ? Double(event.pressure) : nil,
                             tiltX: tablet ? Double(event.tilt.x) : nil, tiltY: tablet ? Double(event.tilt.y) : nil)
        return (point, controller?.device(for: event) ?? (tablet ? .tabletOther : .mouse))
    }

    override func mouseDown(with event: NSEvent) {
        let (point, device) = input(event)
        controller?.pointerDown(point, device: device)
    }

    override func mouseDragged(with event: NSEvent) {
        controller?.pointerMoved(input(event).point)
    }

    override func mouseUp(with event: NSEvent) {
        controller?.pointerUp()
    }

    override func draw(_ dirtyRect: NSRect) {
        guard let controller else { return }
        NSColor.systemRed.setStroke()
        for stroke in controller.visibleStrokes {
            path(stroke.points, width: stroke.width).stroke()
        }
        if controller.gestureIsErasing {
            NSColor.systemGray.withAlphaComponent(0.4).setStroke()
            path(controller.gesturePoints, width: InkSession.eraserRadius * 2).stroke()
        } else if controller.mode == .write {
            NSColor.systemRed.setStroke()
            path(controller.gesturePoints, width: InkSession.penWidth).stroke()
        }
        if let rect = controller.selectionRect {
            let outline = NSBezierPath(rect: NSRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height))
            outline.lineWidth = 2
            outline.setLineDash([6, 4], count: 2, phase: 0)
            NSColor.systemBlue.setStroke()
            outline.stroke()
        }
    }

    private func path(_ points: [InkPoint], width: Double) -> NSBezierPath {
        let path = NSBezierPath()
        path.lineWidth = width
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        guard let first = points.first else { return path }
        path.move(to: NSPoint(x: first.x, y: first.y))
        if points.count == 1 {
            path.line(to: NSPoint(x: first.x + 0.01, y: first.y))
        }
        for point in points.dropFirst() {
            path.line(to: NSPoint(x: point.x, y: point.y))
        }
        return path
    }
}

/// NAV / WRITE / ASK and the WRITE and ASK tools. Icons with accessibility names and selected
/// states; routing only, separate from any teaching state.
struct InkPalette: View {
    @EnvironmentObject private var ink: InkController

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                modeButton(.nav, symbol: "hand.point.up.left", name: "Navigate (NAV)")
                modeButton(.write, symbol: "pencil.tip", name: "Write (WRITE)")
                modeButton(.ask, symbol: "lasso", name: "Ask about a region (ASK)")
                Spacer()
                Button { ink.reopenLatest() } label: { Image(systemName: "clock.arrow.circlepath") }
                    .help("Reopen the latest earlier ink on this display")
                    .accessibilityLabel("Reopen earlier ink")
            }
            if ink.mode == .write {
                HStack(spacing: 6) {
                    Toggle(isOn: Binding(get: { ink.tool == .eraser }, set: { ink.setEraser($0) })) {
                        Image(systemName: "eraser")
                    }
                    .toggleStyle(.button)
                    .help("Erase part of the ink")
                    .accessibilityLabel("Eraser")
                    Button { ink.undo() } label: { Image(systemName: "arrow.uturn.backward") }
                        .disabled(!ink.canUndo)
                        .accessibilityLabel("Undo")
                    Button { ink.redo() } label: { Image(systemName: "arrow.uturn.forward") }
                        .disabled(!ink.canRedo)
                        .accessibilityLabel("Redo")
                    Toggle(isOn: $ink.mouseWriting) { Image(systemName: "computermouse") }
                        .toggleStyle(.button)
                        .help("Let the mouse write")
                        .accessibilityLabel("Allow mouse writing")
                }
            }
            if ink.mode == .ask {
                HStack(spacing: 6) {
                    Button("Finish") { ink.finishAsk() }
                        .disabled(!ink.hasPendingSelection)
                    Button("Cancel") { ink.cancelAsk() }
                }
            }
            if let note = ink.interceptionNote {
                Text(note)
                    .font(.caption.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(ink.message)
                .font(.caption)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(width: 340, alignment: .leading)
        .disabled(!ink.available)
    }

    private func modeButton(_ mode: InputMode, symbol: String, name: String) -> some View {
        Button { ink.setMode(mode) } label: {
            Image(systemName: symbol).frame(width: 22, height: 22)
        }
        .buttonStyle(.bordered)
        .tint(ink.mode == mode ? Color.accentColor : nil)
        .help(name)
        .accessibilityLabel(name)
        .accessibilityAddTraits(ink.mode == mode ? .isSelected : [])
    }
}

/// The ink state in the main window.
struct InkStatusView: View {
    @ObservedObject var ink: InkController

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(ink.available
                 ? "Ink tools are over the selected display (mode \(ink.mode.rawValue), screen-fixed)."
                 : "Ink tools appear over the selected display while capture runs.")
            if let note = ink.interceptionNote {
                Text(note).font(.caption.weight(.semibold))
            }
            Text(ink.message).font(.caption).foregroundStyle(.secondary)
            Text("Content-anchored ink is not implemented; strokes stay at their screen position and keep their original anchor.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
