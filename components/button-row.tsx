"use client"

interface ButtonRowProps {
  lockMode: boolean
  onLockToggle: () => void
  isDark: boolean
  onThemeToggle: () => void
  isUIHidden: boolean
  onUIToggle: () => void
  onHelpClick: () => void
}

export function ButtonRow({
  lockMode,
  onLockToggle,
  isDark,
  onThemeToggle,
  isUIHidden,
  onUIToggle,
  onHelpClick,
}: ButtonRowProps) {
  const buttonBaseClass = `px-4 py-2 font-medium border-2 transition-all duration-300 rounded-tr-lg ${
    isDark
      ? "bg-black text-white border-transparent animate-rainbow-border"
      : "bg-white text-black border-black hover:bg-gray-100"
  }`

  const activeButtonClass = `px-4 py-2 font-medium border-2 transition-all duration-300 rounded-tr-lg ${
    isDark ? "bg-black text-white border-transparent animate-rainbow-border" : "bg-yellow-500 text-white border-black"
  }`

  return (
    <div className="absolute top-4 right-4 z-20 flex gap-2">
      {/* Lock Toggle */}
      <button
        className={lockMode ? activeButtonClass : buttonBaseClass}
        onClick={onLockToggle}
        title="Lock Mode - Click boxes to lock/unlock them"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M6 10V8C6 5.79086 7.79086 4 10 4H14C16.2091 4 18 5.79086 18 8V10M6 10H18M6 10C4.89543 10 4 10.8954 4 12V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V12C20 10.8954 19.1046 10 18 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Theme Toggle */}
      <button className={buttonBaseClass} onClick={onThemeToggle} title="Toggle Dark/Light Theme">
        {isDark ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>

      {/* UI Hide Toggle */}
      <button className={buttonBaseClass} onClick={onUIToggle} title={isUIHidden ? "Show UI" : "Hide UI"}>
        {isUIHidden ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M1 1l22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Help Button */}
      <button className={buttonBaseClass} onClick={onHelpClick} title="Help & Information">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path
            d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  )
}
