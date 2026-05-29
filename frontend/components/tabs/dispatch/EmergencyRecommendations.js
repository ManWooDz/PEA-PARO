'use client'
import { ActionTimeline } from './ActionTimeline'

export function EmergencyRecommendations({ recommendations = [], loading }) {
  return (
    <section>
      <div className="text-xs uppercase eyebrow text-muted mb-3 thai">
        ⚠ คำแนะนำฉุกเฉิน · Early Warning
      </div>
      {loading ? (
        <div className="panel rounded-xl p-6 text-center text-sm text-muted thai">
          กำลังประเมินสถานการณ์…
        </div>
      ) : recommendations.length === 0 ? (
        <div className="panel rounded-xl p-6 text-center text-sm thai" style={{ color: '#10b981' }}>
          🟢 ปกติ — เป็นไปตามแผน
        </div>
      ) : (
        <ActionTimeline recommendations={recommendations} />
      )}
    </section>
  )
}
