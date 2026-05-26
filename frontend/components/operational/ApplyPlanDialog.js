'use client'
export function ApplyPlanDialog({ open, strategy, onConfirm, onCancel, submitting }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.55)' }}
         onClick={onCancel}>
      <div className="panel rounded-xl p-6 max-w-md w-[90%] mx-4"
           onClick={(e) => e.stopPropagation()}>
        <div className="text-base font-semibold mb-2">Apply dispatch plan?</div>
        <div className="text-sm text-muted mb-4">
          This will set the <span className="font-semibold mono" style={{ color: 'var(--primary)' }}>{strategy}</span> plan
          as the active schedule for the next 24 hours. The system will dispatch resources according to this plan
          and log the change for audit.
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-sm border hairline cursor-pointer hover:opacity-80 disabled:opacity-50"
            style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="px-3 py-1.5 rounded text-sm font-medium cursor-pointer hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--primary)', color: '#fff' }}
          >
            {submitting ? 'Applying…' : 'Confirm & Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
