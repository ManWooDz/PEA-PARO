import axios from 'axios'

// In production (Vercel) the backend is served same-origin under /_/backend
// (see vercel.json routePrefix) — so no env var or CORS config is needed.
// Local dev uses the separate uvicorn server on :8000.
// Override with NEXT_PUBLIC_API_URL if your routing differs.
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/_/backend' : 'http://localhost:8000')

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Realtime ────────────────────────────────────────────────────────────────
export const fetchRealtime      = () => api.get('/api/realtime').then(r => r.data)
export const fetchLoadHistory   = () => api.get('/api/realtime/load-history').then(r => r.data)
export const fetchEnergyMix     = () => api.get('/api/realtime/energy-mix').then(r => r.data)
export const fetchEvents        = () => api.get('/api/realtime/events').then(r => r.data)

// ── Dispatch ────────────────────────────────────────────────────────────────
export const fetchDispatch       = (strategy, hasSolar = false) =>
  api.get(`/api/dispatch/${strategy}`, { params: { has_solar: hasSolar } }).then(r => r.data)
export const fetchCustomDispatch = (body)     => api.post('/api/dispatch/custom', body).then(r => r.data)
export const applyDispatchPlan = (payload) => api.post('/api/dispatch/apply', payload).then(r => r.data)

// ── Forecast ────────────────────────────────────────────────────────────────
export const fetchForecast    = (hours = 24) => api.get(`/api/forecast?hours=${hours}`).then(r => r.data)
export const fetchForecast7d  = ()           => api.get('/api/forecast/7days').then(r => r.data)

// ── ML Forecast + Dispatch (combined LSTM endpoint) ─────────────────────────
// timeout: 90s — first call loads the LSTM model + fetches weather data
export const fetchForecastDispatch = (body = {}) =>
  api.post('/api/forecast-dispatch', {
    strategy:   body.strategy   ?? 'min-cost',
    horizon:    body.horizon    ?? '24h',
    use_margin: body.use_margin ?? true,
  }, { timeout: 90000 }).then(r => r.data)

// ── Actionable Recommendations ───────────────────────────────────────────────
export const fetchForecastSeries = (arg = '7day') => {
  const { horizon = '7day', island = 'C' } =
    typeof arg === 'string' ? { horizon: arg } : (arg || {})
  return api.get('/api/forecast/series', { params: { horizon, island } }).then(r => r.data)
}

export const fetchForecastAccuracy = ({ island = 'C', horizon = '6h' } = {}) =>
  api.get('/api/forecast/accuracy', { params: { island, horizon } }).then(r => r.data)

export const fetchForecastCapabilities = () =>
  api.get('/api/forecast/capabilities').then(r => r.data)

// Multipart upload; regeneration can take ~30-60s → long timeout.
// Pass Content-Type multipart/form-data so Axios overrides the instance JSON
// default and attaches the correct boundary for the FormData body.
export const regenerateForecast = (file) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/api/forecast/regenerate', form, {
    timeout: 120000,
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const fetchDayAhead = ({ strategy = 'min-cost', days = 1, hasSolar = false } = {}) =>
  api.get('/api/dispatch/day-ahead', {
    params: { strategy, days, has_solar: hasSolar },
  }).then(r => r.data)

export const fetchIntradayAlerts = (body = {}) =>
  api.post('/api/intraday/alerts', body).then(r => r.data)

export const fetchIntradayScenarios = (body = {}) =>
  api.post('/api/intraday/scenarios', body, { timeout: 30000 }).then(r => r.data)

// ── Day-ahead 15-min schedule (B1) ───────────────────────────────────
export const fetchSchedule  = () => api.get('/api/dispatch/schedule').then(r => r.data)
export const scheduleCsvUrl = () => `${API_BASE}/api/dispatch/schedule.csv`
export const recostSchedule = (overrides) =>
  api.post('/api/dispatch/schedule/recost', { overrides }).then(r => r.data)
export const applySchedule   = (steps) => api.post('/api/dispatch/schedule/apply', { steps }).then(r => r.data)
export const fetchActivePlan = ()       => api.get('/api/dispatch/schedule/active').then(r => r.data)

// ── Report (Tab-bar "รายงาน") ────────────────────────────────────────────────
export const reportUrl = ({ scope = 'current', tab = 'realtime', format = 'html' } = {}) =>
  `${API_BASE}/api/report?scope=${encodeURIComponent(scope)}&tab=${encodeURIComponent(tab)}&format=${encodeURIComponent(format)}`

// ── Notifications (LINE Messaging API) ───────────────────────────────────────
export const fetchNotifyStatus = () => api.get('/api/notify/status').then(r => r.data)
export const sendLineNotify   = (body) => api.post('/api/notify/line', body).then(r => r.data)

// ── Weather ─────────────────────────────────────────────────────────────────
export const fetchWeather = () => api.get('/api/weather').then(r => r.data)

// ── Alerts ──────────────────────────────────────────────────────────────────
export const fetchAlerts      = ()              => api.get('/api/alerts').then(r => r.data)
export const resolveAlert     = (id, action)    =>
  api.patch(`/api/alerts/${id}/resolve`, { action_taken: action }).then(r => r.data)

export default api
