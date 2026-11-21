"use client"

interface UndoRedoButtonsProps {
  onUndo: () => void
  onRedo: () => void
}

export function UndoRedoButtons({ onUndo, onRedo }: UndoRedoButtonsProps) {
  return (
    <div className="absolute top-28 left-4 z-20 flex gap-2">
      <button
        className="px-3 py-2 bg-white border-2 border-black font-medium hover:bg-gray-100 transition-colors rounded-tr-lg"
        onClick={onUndo}
        title="Undo (Ctrl+Z)"
      >
        ↩
      </button>
      <button
        className="px-3 py-2 bg-white border-2 border-black font-medium hover:bg-gray-100 transition-colors rounded-tr-lg"
        onClick={onRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        ↪
      </button>
    </div>
  )
}
