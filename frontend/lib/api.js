import axios from 'axios'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Realtime ────────────────────────────────────────────────────────────────
export const fetchRealtime      = () => api.get('/api/realtime').then(r => r.data)
export const fetchLoadHistory   = () => api.get('/api/realtime/load-history').then(r => r.data)
export const fetchEnergyMix     = () => api.get('/api/realtime/energy-mix').then(r => r.data)

// ── Dispatch ────────────────────────────────────────────────────────────────
export const fetchDispatch       = (strategy) => api.get(`/api/dispatch/${strategy}`).then(r => r.data)
export const fetchCustomDispatch = (body)     => api.post('/api/dispatch/custom', body).then(r => r.data)

// ── Forecast ────────────────────────────────────────────────────────────────
export const fetchForecast    = (hours = 24) => api.get(`/api/forecast?hours=${hours}`).then(r => r.data)
export const fetchForecast7d  = ()           => api.get('/api/forecast/7days').then(r => r.data)

// ── Alerts ──────────────────────────────────────────────────────────────────
export const fetchAlerts      = ()              => api.get('/api/alerts').then(r => r.data)
export const resolveAlert     = (id, action)    =>
  api.patch(`/api/alerts/${id}/resolve`, { action_taken: action }).then(r => r.data)

export default api
