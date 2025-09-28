import os
import uuid
import mimetypes
from typing import Optional, List, Dict, Any

import httpx
from supabase import create_client, Client


class SupabaseStorage:
    """
    Storage adapter backed by Supabase Storage and Postgres table `tracks`.

    Responsibilities:
    - Upload raw bytes to a private Storage bucket
    - Insert/read/delete metadata rows in `public.tracks`
    - Generate signed URLs for client playback/download
    - Download bytes for server-side processing via signed URL
    """

    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SupabaseStorage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")

        self._client: Client = create_client(url, key)
        self._bucket: str = os.environ.get("SUPABASE_BUCKET", "audio")

    def _object_key(self, user_id: str, track_id: str, ext: str, source_track_id: Optional[str] = None) -> str:
        base = f"users/{user_id}/tracks"
        if source_track_id:
            return f"{base}/{source_track_id}/derived/{track_id}{ext}"
        return f"{base}/{track_id}{ext}"

    def store_audio(
        self,
        *,
        user_id: str,
        audio_bytes: bytes,
        filename: str,
        metadata: Dict[str, Any],
        source_track_id: Optional[str] = None,
    ) -> str:
        track_id = str(uuid.uuid4())
        ext = "." + filename.split(".")[-1].lower() if "." in filename else ".wav"
        object_key = self._object_key(user_id, track_id, ext, source_track_id)
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

        # Upload bytes to Storage (private bucket)
        self._client.storage.from_(self._bucket).upload(
            path=object_key,
            file=audio_bytes,
            file_options={"content-type": content_type, "upsert": False},
        )

        size_bytes = len(audio_bytes)

        # Insert metadata row
        row = {
            "track_id": track_id,
            "user_id": user_id,
            "object_key": object_key,
            "filename": filename,
            "extension": ext,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "processing_type": metadata.get("processing_type"),
            "source_track_id": source_track_id,
            "duration_seconds": metadata.get("duration_seconds"),
            "sample_rate": metadata.get("sample_rate"),
            "channels": metadata.get("channels"),
            "metadata": metadata,
        }
        self._client.table("tracks").insert(row).execute()
        return track_id

    def get_track(self, *, user_id: str, track_id: str) -> Optional[Dict[str, Any]]:
        res = (
            self._client
            .table("tracks")
            .select("*")
            .eq("user_id", user_id)
            .eq("track_id", track_id)
            .single()
            .execute()
        )
        return res.data if getattr(res, "data", None) else None

    def list_tracks(self, *, user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        res = (
            self._client
            .table("tracks")
            .select("track_id,filename,size_bytes,created_at,duration_seconds,sample_rate,channels,processing_type")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []

    def delete_track(self, *, user_id: str, track_id: str) -> bool:
        row = self.get_track(user_id=user_id, track_id=track_id)
        if not row:
            return False
        # Delete the Storage object
        self._client.storage.from_(self._bucket).remove([row["object_key"]])
        # Delete DB row
        self._client.table("tracks").delete().eq("user_id", user_id).eq("track_id", track_id).execute()
        return True

    def get_signed_url(self, object_key: str, expires_in: int = 3600) -> str:
        signed = self._client.storage.from_(self._bucket).create_signed_url(object_key, expires_in)
        # supabase-py v2 returns a dict with key 'signedURL'
        return signed.get("signedURL") or signed.get("signed_url")

    async def download_track_bytes(self, *, user_id: str, track_id: str) -> Optional[bytes]:
        row = self.get_track(user_id=user_id, track_id=track_id)
        if not row:
            return None
        signed_url = self.get_signed_url(row["object_key"], 300)
        async with httpx.AsyncClient() as client:
            r = await client.get(signed_url, timeout=60.0)
            r.raise_for_status()
            return r.content


