"""Real Queue (Supabase RPC) and Storage (S3 API) implementations, configured from environment."""

from __future__ import annotations

import os

import boto3
import httpx
from botocore.config import Config

from .jobs import Job


def require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing environment variable {name}")
    return value


class SupabaseQueue:
    """Calls the service-role-only queue functions through PostgREST."""

    def __init__(self, url: str, secret_key: str):
        self.client = httpx.Client(
            base_url=f"{url.rstrip('/')}/rest/v1/rpc/",
            headers={"apikey": secret_key, "Authorization": f"Bearer {secret_key}"},
            timeout=30,
        )

    @classmethod
    def from_env(cls) -> SupabaseQueue:
        return cls(require("TUNEWICK_SUPABASE_URL"), require("TUNEWICK_SUPABASE_SECRET_KEY"))

    def _call(self, function: str, payload: dict):
        response = self.client.post(function, json=payload)
        response.raise_for_status()
        return response.json()

    def claim(self) -> Job | None:
        rows = self._call("claim_audio_upload", {})
        if not rows:
            return None
        row = rows[0]
        return Job(row["id"], row["track_id"], row["object_key"], row["attempts"])

    def finish(self, upload_id: str, report: dict, variants: list[dict]) -> str:
        return self._call(
            "finish_audio_upload", {"upload": upload_id, "report": report, "variants": variants}
        )

    def fail(self, upload_id: str) -> str:
        return self._call("fail_audio_upload", {"upload": upload_id})


class S3Storage:
    def __init__(
        self, endpoint: str, region: str, key_id: str, secret: str, ingest: str, media: str
    ):
        self.s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=region,
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            config=Config(
                s3={"addressing_style": "path"},
                retries={"max_attempts": 5},
                # R2 and other S3-compatible stores: only send checksums when the API requires them.
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )
        self.ingest = ingest
        self.media = media

    @classmethod
    def from_env(cls) -> S3Storage:
        return cls(
            require("MEDIA_S3_ENDPOINT"),
            os.environ.get("MEDIA_S3_REGION") or "auto",
            require("MEDIA_S3_ACCESS_KEY_ID"),
            require("MEDIA_S3_SECRET_ACCESS_KEY"),
            require("MEDIA_INGEST_BUCKET"),
            require("MEDIA_BUCKET"),
        )

    def download_master(self, key: str, path: str) -> None:
        self.s3.download_file(self.ingest, key, path)

    def upload_variant(self, path: str, key: str, content_type: str) -> None:
        self.s3.upload_file(
            path,
            self.media,
            key,
            ExtraArgs={
                "ContentType": content_type,
                # Keys are unique per upload, so variants never change.
                "CacheControl": "public, max-age=31536000, immutable",
            },
        )
