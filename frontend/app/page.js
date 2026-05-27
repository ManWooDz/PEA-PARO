'use client'
import { useState, useEffect, useCallback } from 'react'

import { TopBar }      from '@/components/layout/TopBar'
import { TabBar }      from '@/components/layout/TabBar'
import { Toast }       from '@/components/layout/Toast'
import { ExportModal } from '@/components/layout/ExportModal'

import { Tab1LiveOps }   from '@/components/tabs/Tab1LiveOps'
import { Tab2Dispatch }  from '@/components/tabs/Tab2Dispatch'
import { Tab3Forecast }  from '@/components/tabs/Tab3Forecast'
import { Tab4Alerts }    from '@/components/tabs/Tab4Alerts'

import { useRealtime } from '@/hooks/useRealtime'
import { useDispatch } from '@/hooks/useDispatch'
import { useForecast } from '@/hooks/useForecast'
import { useAlerts }   from '@/hooks/useAlerts'

export default function Home() {
  /* ── UI state ── */
  const [active,     setActive]     = useState('liveops')
  const [theme,      setTheme]      = useState('light')
  const [toast,      setToast_]     = useState(null)
  const [exportOpen, setExportOpen] = useState(false)

  /* ── cross-tab focus state ── */
  const [focusedAlertId, setFocusedAlert] = useState(null)
  const [focusedAssetId, setFocusedAsset] = useState(null)
  const [focusedHour,    setFocusedHour]  = useState(null)
  const [activePlanId,   setActivePlan]   = useState(null)

  // Helper: switch tab AND set focus in one call
  const jumpTo = useCallback((tabId, focus = {}) => {
    setActive(tabId)
    if ('alertId' in focus) setFocusedAlert(focus.alertId)
    if ('assetId' in focus) setFocusedAsset(focus.assetId)
    if ('hour'    in focus) setFocusedHour(focus.hour)
  }, [])

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
  const { data: rt, history, energyMix, error: rtErr, delta, lastReceived } = useRealtime()

  const {
    plans, activeId, loading: dispLoading,
    customCfg, setCustomCfg, applyPlan,
    hasSolar, setHasSolar,
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
        lastUpdated={lastReceived}
      />

      {/* Offline banner */}
      {rtErr && (
        <div className="border-b hairline px-4 py-2 text-sm flex items-center gap-2"
             style={{ background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.3)' }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
          <span style={{ color: '#ef4444', fontWeight: 600 }}>BACKEND DISCONNECTED</span>
          <span className="text-muted">— last data {rt?.server_time ?? '—'} · {rtErr}</span>
        </div>
      )}

      <TabBar
        active={active}
        setActive={setActive}
        alertCount={activeAlerts.length}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {active === 'liveops' && (
          <Tab1LiveOps
            rt={rt} history={history} energyMix={energyMix} delta={delta}
            activeAlerts={activeAlerts}
            focusedAssetId={focusedAssetId} onAssetClick={setFocusedAsset}
            onAlertClick={(id) => jumpTo('alerts', { alertId: id })}
          />
        )}
        {active === 'dispatch' && (
          <Tab2Dispatch
            plans={plans} activeId={activeId} applyPlan={applyPlan}
            customCfg={customCfg} setCustomCfg={setCustomCfg}
            hasSolar={hasSolar} setHasSolar={setHasSolar}
            loading={dispLoading}
            activePlanId={activePlanId} setActivePlanId={setActivePlan}
            focusedHour={focusedHour}
            onHourClick={(h) => jumpTo('forecast', { hour: h })}
          />
        )}
        {active === 'forecast' && (
          <Tab3Forecast
            fd={fd} week={week} hours={hours} setHorizon={setHorizon}
            loading={fcLoading} focusedHour={focusedHour}
          />
        )}
        {active === 'alerts' && (
          <Tab4Alerts
            activeAlerts={activeAlerts} resolvedAlerts={resolvedAlerts}
            resolve={resolve} loading={alertLoading}
            focusedAlertId={focusedAlertId} setFocusedAlertId={setFocusedAlert}
          />
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
