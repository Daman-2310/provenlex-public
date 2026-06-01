"""
SwarmConfig — single source of truth for every runtime toggle.

Environment variables use the prefix GENESIS_ (or legacy SWARM_ for compat).

Critical toggles
----------------
GENESIS_ENVIRONMENT=production   Enables live data feeds, disables sim fallbacks,
                                  enforces mTLS, fails hard on missing API keys.
GENESIS_PBFT_MODE=websocket       Switches PBFT from in-process asyncio queues to
                                  real TCP WebSocket communication between containers.
GENESIS_LIVE_AIS_ENABLED=true     Connect to AISStream.io for real vessel positions.
GENESIS_LIVE_ADSB_ENABLED=true    Connect to OpenSky Network for live ADS-B vectors.

All settings can be supplied via a .env file at the project root.
"""

from __future__ import annotations

import json
import logging
from functools import cached_property
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)


class SwarmConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GENESIS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
        # Legacy SWARM_ prefix still accepted for backward compat
        populate_by_name=True,
    )

    # ── Environment ───────────────────────────────────────────────────────────
    environment: Literal["production", "staging", "development"] = Field(
        default="development",
        description="Runtime environment. 'production' enables live feeds and enforces mTLS.",
    )

    @cached_property
    def is_production(self) -> bool:
        return self.environment == "production"

    @cached_property
    def is_live(self) -> bool:
        """True when any live data source should be used."""
        return self.is_production or self.live_ais_enabled or self.live_adsb_enabled

    # ── AIS live feed (AISStream.io) ──────────────────────────────────────────
    live_ais_enabled: bool = Field(
        default=False,
        alias="GENESIS_LIVE_AIS_ENABLED",
        description="Set true to connect to AISStream.io WebSocket. Requires aisstream_api_key.",
    )
    aisstream_api_key: str = Field(default="", alias="AISSTREAM_API_KEY")
    aisstream_ws_url: str = "wss://stream.aisstream.io/v0/stream"
    # Exponential backoff for AIS reconnection
    ais_backoff_initial_s: float = Field(default=2.0, ge=0.5, le=30.0)
    ais_backoff_max_s: float = Field(default=120.0, ge=10.0, le=600.0)
    ais_backoff_factor: float = Field(default=2.0, ge=1.1, le=4.0)
    # Rate limiting: drop messages above this rate to avoid OOM from high-volume feeds
    ais_rate_limit_msgs_per_min: int = Field(default=2000, ge=100, le=50000)
    ais_buffer_max_size: int = Field(default=500, ge=50, le=5000)
    ais_ping_interval_s: float = Field(default=20.0, ge=5.0)
    ais_ping_timeout_s: float = Field(default=10.0, ge=3.0)

    # ── ADS-B live feed (OpenSky Network) ─────────────────────────────────────
    live_adsb_enabled: bool = Field(
        default=False,
        alias="GENESIS_LIVE_ADSB_ENABLED",
        description="Set true to poll OpenSky Network REST API for live aircraft positions.",
    )
    opensky_username: str = Field(default="", alias="OPENSKY_USERNAME")
    opensky_password: str = Field(default="", alias="OPENSKY_PASSWORD")
    opensky_api_url: str = "https://opensky-network.org/api"
    # Anonymous OpenSky: 1 req/10s; authenticated: 1 req/5s
    opensky_poll_interval_s: float = Field(default=10.0, ge=5.0, le=60.0)
    opensky_backoff_initial_s: float = Field(default=10.0, ge=5.0)
    opensky_backoff_max_s: float = Field(default=300.0, ge=30.0)
    # Bounding box for relevant airspace (North Atlantic + Med + North Sea)
    opensky_bbox_min_lat: float = Field(default=30.0, ge=-90.0, le=90.0)
    opensky_bbox_max_lat: float = Field(default=72.0, ge=-90.0, le=90.0)
    opensky_bbox_min_lon: float = Field(default=-15.0, ge=-180.0, le=180.0)
    opensky_bbox_max_lon: float = Field(default=45.0, ge=-180.0, le=180.0)

    # ── PBFT consensus mode ───────────────────────────────────────────────────
    pbft_mode: Literal["inprocess", "websocket", "grpc"] = Field(
        default="inprocess",
        alias="GENESIS_PBFT_MODE",
        description=(
            "'inprocess' = asyncio queues (dev/test); "
            "'websocket' = TLS WebSocket between containers; "
            "'grpc' = gRPC with generated protobuf stubs."
        ),
    )
    # Per-container identity (set via env in docker-compose)
    pbft_node_id: str = Field(
        default="",
        alias="GENESIS_PBFT_NODE_ID",
        description="e.g. 'replica-0'. Required when pbft_mode != inprocess.",
    )
    # JSON: '{"replica-0":"ws://pbft-0:50050","replica-1":"ws://pbft-1:50051",...}'
    pbft_peers_json: str = Field(
        default="{}",
        alias="GENESIS_PBFT_PEERS",
        description="JSON map of node_id → ws://host:port for all peers.",
    )
    pbft_host: str = Field(default="0.0.0.0")
    pbft_base_port: int = Field(default=50050, ge=1024, le=65535)
    pbft_view_timeout_s: float = Field(default=5.0, ge=1.0, le=60.0)
    pbft_reconnect_interval_s: float = Field(default=3.0, ge=0.5, le=30.0)
    pbft_reconnect_max_attempts: int = Field(default=10, ge=1)
    # Merkle state-sync on partition recovery
    pbft_sync_on_reconnect: bool = True
    pbft_max_rounds_in_memory: int = Field(default=1000, ge=100)

    # ── mTLS / transport security ─────────────────────────────────────────────
    pbft_mtls_enabled: bool = Field(
        default=False,
        description=(
            "Require TLS mutual authentication for inter-node PBFT communication. "
            "Requires certs/ directory populated by scripts/gen_pbft_certs.py."
        ),
    )
    pbft_tls_cert_path: str = "certs/pbft/node.crt"
    pbft_tls_key_path: str = "certs/pbft/node.key"
    pbft_ca_cert_path: str = "certs/pbft/ca.crt"
    # Ed25519 application-layer signing (independent of transport TLS)
    pbft_signing_key_path: str = Field(
        default="",
        description=(
            "Path to Ed25519 private key PEM for message signing. "
            "If empty, a fresh ephemeral key is generated at startup (dev mode)."
        ),
    )

    # ── Message bus ───────────────────────────────────────────────────────────
    use_mock_bus: bool = True
    nats_url: str = "nats://localhost:4222"
    nats_connect_timeout_s: float = Field(default=5.0, ge=1.0)
    nats_reconnect_time_wait_s: float = Field(default=2.0, ge=0.5)
    nats_max_reconnect_attempts: int = Field(default=10, ge=1)

    # ── Consensus ─────────────────────────────────────────────────────────────
    total_bots: int = Field(default=11, ge=4)
    quorum: int = Field(default=7, ge=3)
    consensus_timeout_seconds: float = Field(default=3.0, ge=0.5)

    # ── Alerting ──────────────────────────────────────────────────────────────
    alert_channels: list[str] = Field(default_factory=lambda: ["log", "stdout"])
    webhook_url: str | None = None
    smtp_host: str = ""
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = Field(default="", alias="SMTP_USER")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_to: str = Field(default="", alias="ALERT_EMAIL_TO")
    min_score_for_emergency: float = Field(default=90.0, ge=50.0, le=100.0)
    slack_webhook_url: str = Field(default="", alias="SLACK_WEBHOOK_URL")

    # ── Self-healing ──────────────────────────────────────────────────────────
    heartbeat_timeout_seconds: float = Field(default=15.0, ge=5.0)
    max_restart_attempts: int = Field(default=3, ge=1, le=10)

    # ── API server ────────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = Field(default=8000, ge=1024, le=65535)
    jwt_secret: str = Field(default="change-me-in-production", alias="GENESIS_JWT_SECRET")
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://localhost:3001"],
        description="Set GENESIS_CORS_ORIGINS (comma-separated) in production",
    )
    case_db_path: str = "data/cases.db"
    # HTTP timeouts for all outbound requests
    http_total_timeout_s: float = Field(default=15.0, ge=1.0)
    http_connect_timeout_s: float = Field(default=5.0, ge=0.5)
    http_read_timeout_s: float = Field(default=10.0, ge=1.0)

    # ── Circuit breaker defaults ──────────────────────────────────────────────
    cb_failure_threshold: int = Field(default=5, ge=2, le=20)
    cb_recovery_timeout_s: float = Field(default=30.0, ge=5.0)
    cb_success_threshold: int = Field(default=2, ge=1)

    # ── External data APIs ────────────────────────────────────────────────────
    eia_api_key: str = Field(
        default="",
        alias="EIA_API_KEY",
        description="US EIA API key. The literal string 'DEMO' provides limited anonymous access.",
    )
    ecb_api_base: str = "https://data-api.ecb.europa.eu"
    ofac_feed_url: str = "https://www.treasury.gov/ofac/downloads/sdn.xml"
    celestrak_base: str = "https://celestrak.org"
    ethereum_private_key: str = Field(default="", alias="ETHEREUM_PRIVATE_KEY")

    # ── Audit & compliance ────────────────────────────────────────────────────
    audit_log_path: str = "audit_log"
    data_residency: str = Field(default="LU", pattern=r"^[A-Z]{2}$")

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator("quorum")
    @classmethod
    def quorum_le_total(cls, v: int, info) -> int:
        total = info.data.get("total_bots", 11)
        if v > total:
            raise ValueError(f"quorum ({v}) cannot exceed total_bots ({total})")
        return v

    @model_validator(mode="after")
    def production_gate(self) -> "SwarmConfig":
        if self.is_production:
            if self.live_ais_enabled and not self.aisstream_api_key:
                raise ValueError(
                    "GENESIS_ENVIRONMENT=production with GENESIS_LIVE_AIS_ENABLED=true "
                    "requires AISSTREAM_API_KEY to be set."
                )
            if self.pbft_mode != "inprocess" and not self.pbft_node_id:
                raise ValueError(
                    f"GENESIS_PBFT_MODE={self.pbft_mode} requires GENESIS_PBFT_NODE_ID."
                )
            if self.jwt_secret == "change-me-in-production":
                raise ValueError(
                    "GENESIS_JWT_SECRET is using the default value 'change-me-in-production' in "
                    "production. Set a strong random secret via environment variable before "
                    "deploying to production."
                )
        return self

    @cached_property
    def pbft_peers(self) -> dict[str, str]:
        """Parsed peer map: {node_id: 'ws://host:port'}."""
        try:
            return json.loads(self.pbft_peers_json) if self.pbft_peers_json else {}
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"GENESIS_PBFT_PEERS is not valid JSON: {exc}. "
                "Expected format: '{\"replica-0\":\"ws://host:50050\"}'"
            ) from exc


# Module-level singleton — import this everywhere instead of instantiating per-call
_config: SwarmConfig | None = None


def get_config() -> SwarmConfig:
    """Return the process-wide SwarmConfig singleton."""
    global _config
    if _config is None:
        _config = SwarmConfig()
    return _config


def reset_config() -> None:
    """Force re-read from environment (useful in tests)."""
    global _config
    _config = None
