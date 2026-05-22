"""
Alerts router.
GET   /api/alerts          — list all alerts
PATCH /api/alerts/{id}/resolve — resolve a high-risk alert
"""
import copy
from fastapi import APIRouter, HTTPException
from models.schemas import AlertsResponse, Alert, ResolveRequest
from data.seed import INITIAL_ALERTS

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# In-memory alerts store (reset on server restart — PoC only)
_alerts: list[dict] = copy.deepcopy(INITIAL_ALERTS)


@router.get("", response_model=AlertsResponse)
def get_alerts():
    return AlertsResponse(alerts=[Alert(**a) for a in _alerts])


@router.patch("/{alert_id}/resolve", response_model=AlertsResponse)
def resolve_alert(alert_id: int, body: ResolveRequest):
    for a in _alerts:
        if a["id"] == alert_id:
            if a["status"] == "resolved":
                raise HTTPException(status_code=400, detail="Alert already resolved")
            a["level"]  = "resolved"
            a["status"] = "resolved"
            a["title"]  = f"[แก้ไขแล้ว] {a['title']}"
            a["detail"] += f" · action: {body.action_taken}"
            return AlertsResponse(alerts=[Alert(**x) for x in _alerts])
    raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
