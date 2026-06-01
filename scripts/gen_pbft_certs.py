#!/usr/bin/env python3
"""
Generate mTLS certificates for the PBFT distributed consensus cluster.

Creates a self-signed CA and per-node TLS certificates (RSA-4096 + SHA-256).
Also generates Ed25519 signing keys for application-layer message authentication.

Output directory structure
--------------------------
certs/
  pbft/
    ca.key          CA private key  (keep secret, not distributed to nodes)
    ca.crt          CA certificate  (distributed to all nodes for peer verification)
    replica-0/
      node.key      Node TLS private key
      node.crt      Node TLS certificate signed by CA
      signing.key   Ed25519 private key for message signing (PEM)
      signing.pub   Ed25519 public key (PEM) — shared with all peers
    replica-1/
      ...

Usage
-----
    # Generate certs for 11 replicas (default)
    python scripts/gen_pbft_certs.py

    # Custom output directory and node count
    python scripts/gen_pbft_certs.py --out /etc/genesis/certs --nodes 3

    # Docker: run once, mount certs/ as a read-only volume into all containers
    docker run -v $(pwd)/certs:/certs:ro genesis-swarm-api ...

Security notes
--------------
- CA key is generated locally and should NOT be committed to git or distributed.
- Node certs expire in 825 days (Apple App Transport Security maximum).
- For production, use a proper PKI (Vault, AWS ACM, cert-manager).
- This script is intended for development, test, and private Docker deployments.
"""

from __future__ import annotations

import argparse
import datetime
import ipaddress
import sys
from pathlib import Path

try:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    from cryptography.x509.oid import NameOID
except ImportError:
    print("ERROR: cryptography package required. pip install cryptography>=42.0", file=sys.stderr)
    sys.exit(1)


def _ca_name(common_name: str) -> x509.Name:
    return x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "LU"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Genesis Swarm PBFT Cluster"),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])


def generate_ca(out_dir: Path) -> tuple[rsa.RSAPrivateKey, x509.Certificate]:
    """Generate a self-signed CA key + certificate."""
    print("[gen_pbft_certs] Generating CA key (RSA-4096)...")
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=4096)
    now = datetime.datetime.utcnow()
    ca_cert = (
        x509.CertificateBuilder()
        .subject_name(_ca_name("Genesis PBFT CA"))
        .issuer_name(_ca_name("Genesis PBFT CA"))
        .public_key(ca_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=3650))  # 10 years
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=True,
                crl_sign=True,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .sign(ca_key, hashes.SHA256())
    )

    # Write CA files
    ca_dir = out_dir / "pbft"
    ca_dir.mkdir(parents=True, exist_ok=True)

    (ca_dir / "ca.key").write_bytes(
        ca_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    (ca_dir / "ca.key").chmod(0o600)

    (ca_dir / "ca.crt").write_bytes(ca_cert.public_bytes(serialization.Encoding.PEM))

    print(f"[gen_pbft_certs] CA written to {ca_dir}/ca.{{key,crt}}")
    return ca_key, ca_cert


def generate_node_cert(
    node_id: str,
    ca_key: rsa.RSAPrivateKey,
    ca_cert: x509.Certificate,
    out_dir: Path,
    san_hosts: list[str] | None = None,
) -> None:
    """Generate a TLS key+cert and an Ed25519 signing key for one node."""
    node_dir = out_dir / "pbft" / node_id
    node_dir.mkdir(parents=True, exist_ok=True)

    # ── TLS key + certificate ─────────────────────────────────────────────────
    node_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.datetime.utcnow()

    # SAN: hostname patterns this cert is valid for
    hosts = san_hosts or [node_id, f"pbft-{node_id}", "localhost", "127.0.0.1"]
    san_list: list[x509.GeneralName] = []
    for h in hosts:
        try:
            san_list.append(x509.IPAddress(ipaddress.ip_address(h)))
        except ValueError:
            san_list.append(x509.DNSName(h))

    node_cert = (
        x509.CertificateBuilder()
        .subject_name(_ca_name(f"PBFT {node_id}"))
        .issuer_name(ca_cert.subject)
        .public_key(node_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.SubjectAlternativeName(san_list), critical=False)
        .add_extension(
            x509.ExtendedKeyUsage([
                x509.ExtendedKeyUsageOID.SERVER_AUTH,
                x509.ExtendedKeyUsageOID.CLIENT_AUTH,
            ]),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    (node_dir / "node.key").write_bytes(
        node_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    (node_dir / "node.key").chmod(0o600)
    (node_dir / "node.crt").write_bytes(node_cert.public_bytes(serialization.Encoding.PEM))

    # Also symlink the CA cert into the node dir for convenience
    ca_crt_target = node_dir / "ca.crt"
    if not ca_crt_target.exists():
        ca_crt_target.symlink_to("../ca.crt")

    # ── Ed25519 signing key ───────────────────────────────────────────────────
    signing_key = Ed25519PrivateKey.generate()
    signing_pub = signing_key.public_key()

    (node_dir / "signing.key").write_bytes(
        signing_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    (node_dir / "signing.key").chmod(0o600)

    (node_dir / "signing.pub").write_bytes(
        signing_pub.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )

    print(f"[gen_pbft_certs] {node_id}: node.{{key,crt}} + signing.{{key,pub}} → {node_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate mTLS + Ed25519 signing keys for PBFT cluster"
    )
    parser.add_argument(
        "--out",
        default="certs",
        help="Output directory (default: certs/)",
    )
    parser.add_argument(
        "--nodes",
        type=int,
        default=11,
        help="Number of replicas to generate certs for (default: 11)",
    )
    parser.add_argument(
        "--san",
        nargs="*",
        help="Additional SANs for every node cert (e.g. --san myhost.internal)",
    )
    args = parser.parse_args()

    out_dir = Path(args.out)
    node_ids = [f"replica-{i}" for i in range(args.nodes)]

    ca_key, ca_cert = generate_ca(out_dir)

    for node_id in node_ids:
        # Default SANs: node-id patterns + localhost
        default_sans = [node_id, f"pbft-{node_id}", "localhost", "127.0.0.1"]
        extra = list(args.san or [])
        generate_node_cert(node_id, ca_key, ca_cert, out_dir, default_sans + extra)

    print(
        f"\n[gen_pbft_certs] Done — {args.nodes} nodes. "
        f"Set GENESIS_PBFT_MTLS_ENABLED=true and mount {out_dir}/ into your containers.\n"
        f"  GENESIS_PBFT_TLS_CERT_PATH=certs/pbft/<node-id>/node.crt\n"
        f"  GENESIS_PBFT_TLS_KEY_PATH=certs/pbft/<node-id>/node.key\n"
        f"  GENESIS_PBFT_CA_CERT_PATH=certs/pbft/ca.crt\n"
        f"  GENESIS_PBFT_SIGNING_KEY_PATH=certs/pbft/<node-id>/signing.key\n"
    )


if __name__ == "__main__":
    main()
