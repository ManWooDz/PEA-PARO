'use client'
import { useState, useEffect, useCallback } from 'react'

import { TopBar }      from '@/components/layout/TopBar'
import { TabBar }      from '@/components/layout/TabBar'
import { Toast }       from '@/components/layout/Toast'
import { ExportModal } from '@/components/layout/ExportModal'

import { Tab1Dashboard } from '@/components/tabs/Tab1Dashboard'
import { Tab2Dispatch }  from '@/components/tabs/Tab2Dispatch'
import { Tab3Forecast }  from '@/components/tabs/Tab3Forecast'
import { Tab4Alerts }    from '@/components/tabs/Tab4Alerts'

import { useRealtime } from '@/hooks/useRealtime'
import { useDispatch } from '@/hooks/useDispatch'
import { useForecast } from '@/hooks/useForecast'
import { useAlerts }   from '@/hooks/useAlerts'

export default function Home() {
  /* ── UI state ── */
  const [active,     setActive]     = useState('realtime')
  const [theme,      setTheme]      = useState('light')
  const [toast,      setToast_]     = useState(null)
  const [exportOpen, setExportOpen] = useState(false)

  /* theme class on body */
  useEffect(() => {
    document.body.className = theme === 'light' ? 'theme-light' : ''
  }, [theme])

  /* toast helper — auto-dismiss after 3s */
  const showToast = useCallback((title, subtitle) => {
    setToast_({ title, subtitle })
    setTimeout(() => setToast_(null), 3000)
  }, [])

  /* ── data hooks ── */
  const { data: rt, history, energyMix, error: rtErr, delta } = useRealtime()

  const {
    plans, activeId, loading: dispLoading,
    customCfg, setCustomCfg, applyPlan,
  } = useDispatch()

  const {
    fd, week, hours, setHorizon, loading: fcLoading,
  } = useForecast()

  const {
    activeAlerts, resolvedAlerts, loading: alertLoading, resolve,
  } = useAlerts()

  /* ── render ── */
  return (
    <>
      <TopBar
        theme={theme}
        setTheme={setTheme}
        onExport={() => setExportOpen(true)}
      />

      <TabBar
        active={active}
        setActive={setActive}
        alertCount={activeAlerts.length}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {rtErr && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm"
               style={{
                 color: '#f87171',
                 background: 'rgba(239,68,68,0.08)',
                 border: '1px solid rgba(239,68,68,0.25)',
               }}>
            ⚠ API error: {rtErr}
          </div>
        )}

        {active === 'realtime'  && (
          <Tab1Dashboard rt={rt} history={history} energyMix={energyMix} delta={delta} />
        )}
        {active === 'dispatch'  && (
          <Tab2Dispatch
            plans={plans} activeId={activeId} applyPlan={applyPlan}
            customCfg={customCfg} setCustomCfg={setCustomCfg}
            loading={dispLoading}
          />
        )}
        {active === 'forecast'  && (
          <Tab3Forecast fd={fd} week={week} hours={hours} setHorizon={setHorizon} loading={fcLoading} />
        )}
        {active === 'alerts'    && (
          <Tab4Alerts activeAlerts={activeAlerts} resolvedAlerts={resolvedAlerts} resolve={resolve} loading={alertLoading} />
        )}
      </main>

      <Toast toast={toast} />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        showToast={showToast}
        active={active}
      />
    </>
  )
}
