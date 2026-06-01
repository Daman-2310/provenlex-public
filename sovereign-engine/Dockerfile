# =============================================================================
# GENESIS SWARM -- PRODUCTION MULTI-STAGE DOCKERFILE
# Target: x86_64-unknown-linux-musl (fully static, no glibc dependency)
# Strategy: three-stage build with aggressive layer caching
#
# Stage 1 (cache)   : dependency-only build layer -- invalidated only on
#                     Cargo.toml / Cargo.lock change, not on src change.
# Stage 2 (builder) : full source build with native CPU optimizations.
# Stage 3 (runtime) : distroless scratch image -- attack surface ~0.
#
# Build: docker build --build-arg TARGETARCH=x86_64 -t genesis-engine:latest .
# Inspect binary: docker run --rm genesis-engine:latest ls -lh /engine
# =============================================================================

# ── STAGE 1: dependency cache layer ──────────────────────────────────────────
# Uses a pre-installed cross toolchain image with musl libc and bindgen support.
# All crate dependencies are compiled here; this layer is re-used across builds
# as long as Cargo.toml and Cargo.lock are unchanged.
FROM rust:1.80-slim-bookworm AS cache

# Install musl cross-compilation toolchain + OpenSSL static libs
RUN apt-get update && apt-get install -y --no-install-recommends \
        musl-tools        \
        musl-dev          \
        pkg-config        \
        libssl-dev        \
        ca-certificates   \
        make              \
        clang             \
        llvm              \
    && rm -rf /var/lib/apt/lists/*

# Add the musl target
RUN rustup target add x86_64-unknown-linux-musl

# Create a dummy project with the same manifest to pre-build dependencies.
# When the actual source changes but Cargo.toml does not, this layer is cached.
WORKDIR /build
COPY Cargo.toml Cargo.lock ./

# Create stub source to satisfy the build graph without compiling real code
RUN mkdir -p src benches \
    && echo 'fn main() {}' > src/main.rs \
    && echo 'fn main() {}' > benches/swarm_perf.rs \
    && echo 'fn main() {}' > benches/hot_path_bench.rs \
    && echo 'fn main() {}' > benches/zk_verify_bench.rs

# Pre-compile all dependencies (musl target, release profile)
ENV RUSTFLAGS="-C target-cpu=native -C opt-level=3 -C link-arg=-s"
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --target x86_64-unknown-linux-musl 2>&1 | tail -5 \
    && echo "Dependency pre-build complete"

# ── STAGE 2: full source build ────────────────────────────────────────────────
# Copies the real source on top of the pre-built deps layer.
# Only Rust files change between iterations -- deps layer is always cache-hit.
FROM cache AS builder

WORKDIR /build

# Copy real source (overwrites the stubs)
COPY src/     ./src/
COPY benches/ ./benches/

# Compile the production binary
# -C target-cpu=native     : enables AVX-512/AVX2 on the build host
# -C opt-level=3           : maximum scalar optimisation (same as profile.release)
# -C link-arg=-s           : strip symbols via linker (belt-and-suspenders)
# --target musl            : fully static binary, no glibc, no dynamic linker
# --locked                 : fail if Cargo.lock is outdated (reproducible builds)
ENV RUSTFLAGS="-C target-cpu=native -C opt-level=3 -C link-arg=-s -C target-feature=+avx2"
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release --target x86_64-unknown-linux-musl --locked \
    && cp target/x86_64-unknown-linux-musl/release/genesis-engine /usr/local/bin/genesis-engine

# Verify the binary is truly static
RUN file /usr/local/bin/genesis-engine \
    && ldd  /usr/local/bin/genesis-engine 2>&1 | grep -q "not a dynamic executable" \
    && echo "Binary is fully static -- musl OK" \
    || (echo "WARNING: binary has dynamic dependencies" && ldd /usr/local/bin/genesis-engine)

# Strip final binary (belt-and-suspenders; RUSTFLAGS already strips in most cases)
RUN strip --strip-all /usr/local/bin/genesis-engine \
    && ls -lh /usr/local/bin/genesis-engine

# ── STAGE 3: distroless runtime ───────────────────────────────────────────────
# Zero attack surface: no shell, no package manager, no debug tooling.
# The musl binary is self-contained -- this image needs nothing else.
FROM scratch AS runtime

# DORA Art.9: copy TLS root certificates for outbound compliance reporting
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Copy the genesis-engine binary
COPY --from=builder /usr/local/bin/genesis-engine /engine

# Runtime environment
# N_AGENTS, MAX_LEVERAGE, etc. are injected via docker-compose environment section
ENV RUST_LOG="genesis_engine=info,warn"
ENV RUST_BACKTRACE="1"

# DORA Art.9: expose the compliance reporting API port
EXPOSE 8443

# Non-root user (numeric UID -- scratch has no /etc/passwd)
USER 1000:1000

# Entrypoint: the genesis-engine binary
# Receives configuration via environment variables and command-line flags.
# Real-time scheduling (SCHED_FIFO) is set by the engine itself at startup
# if it detects CAP_SYS_NICE or is invoked as root.
ENTRYPOINT ["/engine"]
CMD ["--log-level", "info", "--compliance-api-port", "8443"]

# ── BUILD METADATA ────────────────────────────────────────────────────────────
ARG BUILD_DATE
ARG GIT_SHA
ARG VERSION="0.6.0"

LABEL org.opencontainers.image.title="genesis-swarm-engine"
LABEL org.opencontainers.image.description="AIFMD/MiFID II/DORA compliance engine -- Luxembourg sovereign grade"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.licenses="PROPRIETARY"
LABEL com.genesisswarm.regulatory.basis="DORA-2022/2554/EU AIFMD-2011/61/EU CSSF-22/816"
