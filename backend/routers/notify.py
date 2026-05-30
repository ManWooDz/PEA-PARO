"""
LINE Messaging API notifications.

Pushes an operator alert to a LINE target (user / group) via the push-message API.
Configure with environment variables:
  LINE_CHANNEL_ACCESS_TOKEN  — long-lived channel access token (Messaging API)
  LINE_TARGET_ID             — destination userId / groupId

When the token/target are not set the endpoint runs in **simulated mode**: it
returns the exact message that would be sent, so the demo works end-to-end without
a live LINE Official Account. Add the env vars to go live — no code change needed.

Docs: https://developers.line.biz/en/docs/messaging-api/
"""
import os
import requests
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/notify", tags=["notify"])

_LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push"

_LEVEL_ICON = {"high": "🔴", "medium": "🟡", "low": "🔵"}


def _line_config() -> tuple[str, str]:
    return os.getenv("LINE_CHANNEL_ACCESS_TOKEN", ""), os.getenv("LINE_TARGET_ID", "")


class LineNotifyRequest(BaseModel):
    title: str
    detail: str = ""
    recommended_action: str | None = None
    level: str | None = None


class NotifyResponse(BaseModel):
    sent: bool
    simulated: bool
    message: str       # the exact text that was (or would be) sent
    detail: str = ""   # human-readable status


def _format_message(req: LineNotifyRequest) -> str:
    icon = _LEVEL_ICON.get(req.level or "", "⚠️")
    lines = [f"{icon} PEA-PARO · แจ้งเตือน", "", req.title]
    if req.detail:
        lines += ["", req.detail]
    if req.recommended_action:
        lines += ["", f"ข้อเสนอแนะ: {req.recommended_action}"]
    return "\n".join(lines)


@router.get("/status")
def notify_status():
    """Whether LINE is configured — drives the channel-status badge in the UI."""
    token, target = _line_config()
    return {"line_configured": bool(token and target)}


@router.post("/line", response_model=NotifyResponse)
def notify_line(req: LineNotifyRequest):
    token, target = _line_config()
    message = _format_message(req)

    # Simulated mode — no live Official Account yet.
    if not (token and target):
        return NotifyResponse(
            sent=False,
            simulated=True,
            message=message,
            detail="LINE ยังไม่ได้ตั้งค่า — โหมดจำลอง (ตั้ง LINE_CHANNEL_ACCESS_TOKEN / LINE_TARGET_ID เพื่อส่งจริง)",
        )

    # Live push.
    try:
        resp = requests.post(
            _LINE_PUSH_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"to": target, "messages": [{"type": "text", "text": message}]},
            timeout=10,
        )
        if resp.status_code == 200:
            return NotifyResponse(sent=True, simulated=False, message=message,
                                  detail="ส่ง LINE สำเร็จ")
        return NotifyResponse(sent=False, simulated=False, message=message,
                              detail=f"LINE API error {resp.status_code}: {resp.text[:200]}")
    except Exception as exc:
        return NotifyResponse(sent=False, simulated=False, message=message,
                              detail=f"ส่ง LINE ไม่สำเร็จ: {exc}")
