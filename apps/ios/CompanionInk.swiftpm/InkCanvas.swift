import PencilKit
import SwiftUI

/// Input modes stay separate from any teaching state. Only WRITE creates ink, and
/// writing never asks for an explanation.
enum InputMode: String, CaseIterable, Identifiable {
    case nav = "NAV"
    case write = "WRITE"
    case ask = "ASK"

    var id: Self { self }
}

enum InkTool {
    case pen
    case eraser
}

/// PencilKit canvas for the user's own ink, laid exactly over the page so its coordinates
/// are page coordinates.
struct InkCanvas: UIViewRepresentable {
    let initialDrawing: PKDrawing
    let isWriting: Bool
    let tool: InkTool
    let fingerInk: Bool
    let onChange: (PKDrawing) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onChange: onChange)
    }

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        // Set the saved drawing before the delegate, so loading is not treated as an edit.
        canvas.drawing = initialDrawing
        canvas.delegate = context.coordinator
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        // The page scrolls around the canvas; the canvas itself never scrolls.
        canvas.isScrollEnabled = false
        // Keep black ink black in Dark Mode, matching the white page.
        canvas.overrideUserInterfaceStyle = .light
        apply(to: canvas)
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        context.coordinator.onChange = onChange
        apply(to: canvas)
    }

    private func apply(to canvas: PKCanvasView) {
        // Outside WRITE the canvas takes no touches, so nothing can draw.
        canvas.isUserInteractionEnabled = isWriting
        // Pencil writes and fingers navigate, unless finger ink is explicitly turned on.
        canvas.drawingPolicy = fingerInk ? .anyInput : .pencilOnly
        switch tool {
        case .pen:
            canvas.tool = PKInkingTool(.pen, color: .black, width: 3)
        case .eraser:
            canvas.tool = PKEraserTool(.vector)
        }
    }

    @MainActor
    final class Coordinator: NSObject, PKCanvasViewDelegate {
        var onChange: (PKDrawing) -> Void

        init(onChange: @escaping (PKDrawing) -> Void) {
            self.onChange = onChange
        }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            onChange(canvasView.drawing)
        }
    }
}
