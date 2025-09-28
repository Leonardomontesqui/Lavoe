import os
import httpx
from fastapi import HTTPException


async def get_user_id_from_token(authorization_header: str | None) -> str:
    """
    Resolve Supabase user id from Authorization: Bearer <jwt> using the /auth/v1/user endpoint.
    Requires SUPABASE_URL and SUPABASE_ANON_KEY env vars.
    """
    if not authorization_header or not authorization_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing auth token")

    token = authorization_header.split(" ", 1)[1]
    url = os.environ.get("SUPABASE_URL")
    anon = os.environ.get("SUPABASE_ANON_KEY")
    if not url or not anon:
        raise HTTPException(status_code=500, detail="Supabase auth env vars not configured")

    endpoint = url.rstrip("/") + "/auth/v1/user"
    headers = {"Authorization": f"Bearer {token}", "apikey": anon}
    async with httpx.AsyncClient() as client:
        resp = await client.get(endpoint, headers=headers, timeout=10)
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid auth token")
        data = resp.json()
        return data["id"]


