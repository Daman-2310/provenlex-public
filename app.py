import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

from genesis_swarm.api.cloud_app import app  # noqa: F401, E402
