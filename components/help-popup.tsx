"use client"

interface HelpPopupProps {
  isOpen: boolean
  onClose: () => void
  isDark: boolean
}

export function HelpPopup({ isOpen, onClose, isDark }: HelpPopupProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className={`relative max-w-md w-full rounded-lg p-6 ${
          isDark ? "bg-gray-800 text-white" : "bg-white text-black"
        }`}
      >
        {/* Header with close and mail buttons */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1" />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={`text-xl font-bold hover:opacity-70 transition-opacity ${
                isDark ? "text-white" : "text-black"
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="pr-2">
          <p className="text-sm leading-relaxed mb-4">
            This is a digital ruler. If you have an idea for how much spacing a component should take up on your live
            coded app, you can understand the exact dimensions you need to tell it here:
          </p>

          <div
            className={`p-3 rounded mb-4 font-mono text-sm ${
              isDark ? "bg-gray-700 text-green-400" : "bg-gray-100 text-green-600"
            }`}
          >
            {`// Make the navbar 13vh and the logo on the left side 10vw 10vh`}
          </div>

          <p className="text-sm leading-relaxed mb-6">
            You can use this to mockup vibe coding container layouts to your specifications via screenshot. Specify each
            box by its dimensions, what it's for.
          </p>

          {/* Mail button positioned at bottom right */}
          <div className="flex justify-end">
            <a
              href="mailto:brock@newschool.edu"
              className={`inline-flex items-center px-4 py-2 rounded border-2 transition-colors ${
                isDark
                  ? "border-white text-white hover:bg-white hover:text-black"
                  : "border-black text-black hover:bg-black hover:text-white"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="22,6 12,13 2,6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
