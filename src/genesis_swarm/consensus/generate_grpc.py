"""
Generate Python gRPC stubs from consensus_mesh.proto.

Run from the repository root:
    python src/genesis_swarm/consensus/generate_grpc.py

Requires:  pip install grpcio-tools>=1.63
Outputs :  src/genesis_swarm/consensus/mesh_pb2.py
           src/genesis_swarm/consensus/mesh_pb2_grpc.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[4]
    proto_dir = Path(__file__).resolve().parent
    proto_file = proto_dir / "consensus_mesh.proto"
    out_dir = proto_dir

    if not proto_file.exists():
        print(f"ERROR: proto not found at {proto_file}", file=sys.stderr)
        sys.exit(1)

    cmd = [
        sys.executable, "-m", "grpc_tools.protoc",
        f"-I{proto_dir}",
        f"--python_out={out_dir}",
        f"--grpc_python_out={out_dir}",
        str(proto_file),
    ]
    print("Running:", " ".join(cmd))
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print("ERROR: protoc failed — install grpcio-tools: pip install grpcio-tools>=1.63",
              file=sys.stderr)
        sys.exit(result.returncode)

    # Fix absolute imports in generated files (protoc uses pkg-relative imports)
    for fname in ("mesh_pb2.py", "mesh_pb2_grpc.py"):
        fpath = out_dir / fname
        if fpath.exists():
            text = fpath.read_text()
            text = text.replace(
                "import consensus_mesh_pb2",
                "from genesis_swarm.consensus import mesh_pb2",
            )
            fpath.write_text(text)
            print(f"Patched imports in {fname}")

    print("Done. Stubs written to", out_dir)


if __name__ == "__main__":
    main()
