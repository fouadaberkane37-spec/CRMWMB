import React, { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, size = 'md' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.7)',
        // Push modal up so it's not hidden behind the bottom nav
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 72px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl w-full ${widths[size]} flex flex-col`}
        style={{ maxHeight: 'calc(100vh - env(safe-area-inset-bottom) - 96px)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 hover:bg-slate-700 rounded-lg p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
