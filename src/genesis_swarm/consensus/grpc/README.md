# PBFT over gRPC — Distributed Process Isolation

## Overview

This package implements true distributed PBFT where each replica runs as an **independent OS process** with its own gRPC server socket.

### Why this matters vs. the asyncio.Queue approach

| | asyncio.Queue (in-process) | gRPC (this package) |
|---|---|---|
| Failure domain | One `os._exit(0)` kills all 11 replicas | Each replica is an independent process |
| Network partitions | Impossible (shared memory) | Real TCP timeouts, network drops |
| Scaling | All 11 replicas share one GIL | Each replica scales independently |
| Deployment | One Docker container | 11 containers (one per replica) |

## Quickstart

### Dev mode (all 11 replicas on localhost)

```bash
# Start all 11 replicas
GENESIS_PBFT_MODE=grpc python -m genesis_swarm.consensus.grpc.process_coordinator

# Or start individually (e.g., in Docker Compose):
for i in $(seq 0 10); do
  python -m genesis_swarm.consensus.grpc.replica_server \
    --node-id replica-$i \
    --port $((50050 + i)) \
    --peers $(python scripts/peer_list.py $i) &
done
```

### Docker Compose (production)

```yaml
# docker-compose.pbft.yml (add to docker-compose.yml)
services:
  pbft-replica-0:
    build: .
    command: python -m genesis_swarm.consensus.grpc.replica_server --node-id replica-0 --port 50050
    ports: ["50050:50050"]
    environment:
      - GENESIS_PBFT_HOST=0.0.0.0
  # ... repeat for replica-1 through replica-10
```

## Generating gRPC stubs

The proto file is at `proto/pbft.proto`. Generate Python stubs with:

```bash
pip install grpcio-tools
python -m grpc_tools.protoc \
    -I proto \
    --python_out=src/genesis_swarm/consensus/grpc \
    --grpc_python_out=src/genesis_swarm/consensus/grpc \
    proto/pbft.proto
```

Then update `replica_server.py` to import and use the generated `pbft_pb2` and `pbft_pb2_grpc` modules.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `GENESIS_PBFT_MODE` | `inprocess` | Set to `grpc` to use distributed processes |
| `GENESIS_PBFT_BASE_PORT` | `50050` | Starting port for replica-0 |
| `GENESIS_PBFT_HOST` | `127.0.0.1` | Bind host for replicas |

## Current status

- [x] Proto definition (`proto/pbft.proto`) — all 5 message types
- [x] Replica servicer (`replica_server.py`) — handles PRE-PREPARE, PREPARE, COMMIT, VIEW-CHANGE, NEW-VIEW, PING
- [x] Process coordinator (`process_coordinator.py`) — spawns N processes, drives consensus rounds
- [x] Graceful degradation — falls back to in-process asyncio.Queue if `grpcio` not installed
- [ ] Generate and commit protoc stubs (requires `grpcio-tools`)
- [ ] Docker Compose service definitions for all 11 replicas
- [ ] TLS mutual authentication between replicas (replace `insecure_channel`)
