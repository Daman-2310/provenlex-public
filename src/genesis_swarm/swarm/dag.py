"""
Dynamic DAG Task Allocation — Pillar 3.

``SwarmTopologyManager`` compiles abstract macro-instructions into fully
resolved dependency graphs (DAGs) of sub-tasks, assigns each node to the
least-loaded capable agent, and produces a wave-based execution schedule
suitable for parallel mesh dispatch.

Graph semantics
---------------
- Nodes are ``TaskNode`` objects (frozen Pydantic models)
- Edges represent dependencies: ``add_edge(a, b)`` means B depends on A
- ``execution_waves()`` groups mutually independent nodes for parallel dispatch

Instruction DSL
---------------
Sequential:  "ANALYSE → SANCTIONS → KYC → ROUTE"
Parallel:    "ANALYSE → [SANCTIONS, KYC, CARGO] → REPORT"

Each token name maps to the capability token of the same name.  Unknown token
names are accepted and simply require an agent advertising that exact token.

Load balancing
--------------
Per-agent cost: ``queue_depth / max_throughput``.  Lowest cost wins each slot.
Speculative depth increments prevent the same agent from sweeping an entire wave.

Usage
-----
    mgr = SwarmTopologyManager()
    mgr.register_agent("compliance-bot", {"KYC", "SANCTIONS", "ANALYSE"})
    mgr.register_agent("cargo-bot",      {"CARGO", "ROUTE", "ANALYSE"})

    plan = mgr.compile("ANALYSE → [SANCTIONS, KYC] → ROUTE")
    for wave in plan.execution_waves():
        for task in wave:
            agent_id = plan.assigned_agent(task.task_id)
            envelope  = mesh.make_envelope("tasks", task.to_payload())
            await mesh.publish("tasks", envelope)
"""

from __future__ import annotations

import hashlib
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

_log = logging.getLogger(__name__)


# ── Task node ─────────────────────────────────────────────────────────────────


class TaskNode(BaseModel):
    """A single unit of work within a swarm task DAG."""

    model_config = ConfigDict(frozen=True)

    task_id: str
    operation: str
    capability_tokens: frozenset[str] = Field(default_factory=frozenset)
    priority: int = Field(ge=0, le=100, default=50)
    estimated_tokens: int = Field(ge=0, default=512)
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: float = Field(default_factory=time.time)

    @classmethod
    def create(
        cls,
        operation: str,
        *,
        capability_tokens: set[str] | frozenset[str] | None = None,
        priority: int = 50,
        estimated_tokens: int = 512,
        payload: dict[str, Any] | None = None,
    ) -> "TaskNode":
        """Create a TaskNode with a short auto-generated task_id."""
        raw = f"{operation}:{time.monotonic_ns()}".encode()
        task_id = hashlib.sha256(raw).hexdigest()[:12]
        return cls(
            task_id=task_id,
            operation=operation,
            capability_tokens=frozenset(capability_tokens or set()),
            priority=priority,
            estimated_tokens=estimated_tokens,
            payload=payload or {},
        )

    def to_payload(self) -> dict[str, Any]:
        """Serialise to a plain dict suitable for ``MeshEnvelope.payload``."""
        return {
            "task_id": self.task_id,
            "operation": self.operation,
            "capability_tokens": sorted(self.capability_tokens),
            "priority": self.priority,
            "estimated_tokens": self.estimated_tokens,
            "payload": self.payload,
        }


# ── DAG graph ─────────────────────────────────────────────────────────────────


class CycleDetectedError(Exception):
    """Raised when a dependency cycle is discovered during compilation."""


@dataclass
class DAGGraph:
    """
    Directed Acyclic Graph over TaskNode objects.

    Edge semantics: ``add_edge(a_id, b_id)`` means B depends on A
    (A must finish before B starts).  ``topological_sort()`` returns nodes
    in a valid serial order.  ``execution_waves()`` groups them by parallel tier.
    """

    _nodes: dict[str, TaskNode] = field(default_factory=dict)
    _edges: dict[str, list[str]] = field(
        default_factory=lambda: defaultdict(list)
    )
    _in_degree: dict[str, int] = field(
        default_factory=lambda: defaultdict(int)
    )

    def add_node(self, node: TaskNode) -> None:
        if node.task_id not in self._nodes:
            self._nodes[node.task_id] = node
            self._in_degree.setdefault(node.task_id, 0)

    def add_edge(self, from_id: str, to_id: str) -> None:
        """Declare that *to_id* depends on *from_id*."""
        if from_id not in self._nodes or to_id not in self._nodes:
            raise KeyError(
                f"Both task IDs must be registered before adding an edge "
                f"({from_id!r} → {to_id!r})"
            )
        self._edges[from_id].append(to_id)
        self._in_degree[to_id] = self._in_degree.get(to_id, 0) + 1

    def topological_sort(self) -> list[TaskNode]:
        """
        Kahn's BFS topological sort.

        Within each BFS level, nodes are emitted in descending priority order
        so high-priority work is dispatched first.  Raises ``CycleDetectedError``
        if the graph is not acyclic.
        """
        in_deg = dict(self._in_degree)
        queue: deque[str] = deque(
            sorted(
                (nid for nid, deg in in_deg.items() if deg == 0),
                key=lambda nid: -self._nodes[nid].priority,
            )
        )
        result: list[TaskNode] = []

        while queue:
            nid = queue.popleft()
            result.append(self._nodes[nid])
            for successor_id in self._edges.get(nid, []):
                in_deg[successor_id] -= 1
                if in_deg[successor_id] == 0:
                    queue.append(successor_id)

        if len(result) != len(self._nodes):
            resolved = {n.task_id for n in result}
            cycle_ids = set(self._nodes) - resolved
            raise CycleDetectedError(
                f"Cycle detected — these nodes cannot be scheduled: {cycle_ids}"
            )
        return result

    def execution_waves(self) -> list[list[TaskNode]]:
        """
        Group tasks into parallel execution waves.

        All tasks within a wave have no mutual dependencies and can be
        dispatched simultaneously.  Wave N+1 begins only after all tasks
        in wave N complete.  Raises ``CycleDetectedError`` on a cyclic graph.
        """
        in_deg = dict(self._in_degree)
        remaining = set(self._nodes)
        waves: list[list[TaskNode]] = []

        while remaining:
            ready = sorted(
                [nid for nid in remaining if in_deg.get(nid, 0) == 0],
                key=lambda nid: -self._nodes[nid].priority,
            )
            if not ready:
                raise CycleDetectedError(
                    f"Cycle detected — these nodes remain unschedulable: {remaining}"
                )
            waves.append([self._nodes[nid] for nid in ready])
            for nid in ready:
                remaining.discard(nid)
                for succ in self._edges.get(nid, []):
                    in_deg[succ] -= 1

        return waves

    def nodes(self) -> list[TaskNode]:
        return list(self._nodes.values())

    def node_count(self) -> int:
        return len(self._nodes)

    def edge_count(self) -> int:
        return sum(len(v) for v in self._edges.values())


# ── Compiled execution plan ───────────────────────────────────────────────────


@dataclass
class CompiledPlan:
    """Result of ``SwarmTopologyManager.compile()``."""

    macro_instruction: str
    graph: DAGGraph
    _assignments: dict[str, str]  # task_id → agent_id

    def execution_waves(self) -> list[list[TaskNode]]:
        return self.graph.execution_waves()

    def assigned_agent(self, task_id: str) -> str:
        """Return the agent assigned to *task_id*, or ``"unassigned"``."""
        return self._assignments.get(task_id, "unassigned")

    def summary(self) -> dict[str, Any]:
        return {
            "macro": self.macro_instruction,
            "nodes": self.graph.node_count(),
            "edges": self.graph.edge_count(),
            "waves": len(self.execution_waves()),
            "assignments": dict(self._assignments),
        }


# ── Agent capability registry ─────────────────────────────────────────────────


@dataclass
class _AgentRecord:
    agent_id: str
    tokens: frozenset[str]
    queue_depth: int = 0
    max_throughput: int = 10


class AgentCapabilityRegistry:
    """Maps agent IDs to their capability token sets and current load."""

    def __init__(self) -> None:
        self._agents: dict[str, _AgentRecord] = {}

    def register(
        self,
        agent_id: str,
        tokens: set[str] | frozenset[str],
        *,
        max_throughput: int = 10,
    ) -> None:
        self._agents[agent_id] = _AgentRecord(
            agent_id=agent_id,
            tokens=frozenset(tokens),
            max_throughput=max_throughput,
        )
        _log.debug(
            "capability_registered",
            extra={"agent_id": agent_id, "tokens": sorted(tokens)},
        )

    def deregister(self, agent_id: str) -> None:
        self._agents.pop(agent_id, None)

    def update_queue_depth(self, agent_id: str, depth: int) -> None:
        if agent_id in self._agents:
            self._agents[agent_id].queue_depth = depth

    def capable_agents(self, required: frozenset[str]) -> list[_AgentRecord]:
        return [r for r in self._agents.values() if required.issubset(r.tokens)]

    def least_loaded(self, required: frozenset[str]) -> str | None:
        """Return the agent ID with the lowest cost score, or None."""
        candidates = self.capable_agents(required)
        if not candidates:
            return None
        best = min(candidates, key=lambda r: r.queue_depth / max(r.max_throughput, 1))
        return best.agent_id

    def all_agents(self) -> list[str]:
        return list(self._agents)


# ── DSL compiler ──────────────────────────────────────────────────────────────


_BUILTIN_TOKENS: dict[str, frozenset[str]] = {
    op: frozenset({op})
    for op in (
        "ANALYSE", "SANCTIONS", "KYC", "ROUTE", "CARGO",
        "COMPLIANCE", "FX", "RISK", "AUDIT", "REPORT",
        "SOVEREIGN", "NAV", "ORBITAL",
    )
}


class TaskCompiler:
    """
    Parses a macro-instruction DSL string into a ``DAGGraph``.

    Grammar::

        instruction ::= step ("→" step)*
        step        ::= OPERATION | "[" OPERATION ("," OPERATION)* "]"
        OPERATION   ::= [A-Z_]+

    Sequential steps are chained; bracketed groups expand to parallel nodes.
    """

    def compile(
        self,
        instruction: str,
        *,
        base_priority: int = 50,
        payload: dict[str, Any] | None = None,
    ) -> DAGGraph:
        graph = DAGGraph()
        raw_steps = [s.strip() for s in instruction.split("→")]
        previous_ids: list[str] = []

        for step_idx, raw_step in enumerate(raw_steps):
            raw_step = raw_step.strip()
            if not raw_step:
                continue

            ops = (
                [s.strip() for s in raw_step[1:-1].split(",")]
                if raw_step.startswith("[") and raw_step.endswith("]")
                else [raw_step]
            )

            current_ids: list[str] = []
            for op in ops:
                op_upper = op.upper()
                tokens = _BUILTIN_TOKENS.get(op_upper, frozenset({op_upper}))
                node = TaskNode.create(
                    operation=op_upper,
                    capability_tokens=tokens,
                    priority=max(0, base_priority - step_idx * 5),
                    payload=payload or {},
                )
                graph.add_node(node)
                current_ids.append(node.task_id)

            for prev_id in previous_ids:
                for cur_id in current_ids:
                    graph.add_edge(prev_id, cur_id)

            previous_ids = current_ids

        return graph


# ── SwarmTopologyManager ──────────────────────────────────────────────────────


class SwarmTopologyManager:
    """
    Public facade for DAG compilation and dynamic agent assignment.

    Combines ``TaskCompiler`` (instruction → DAG) with
    ``AgentCapabilityRegistry`` (token-based routing + load balancing)
    to produce a ``CompiledPlan`` ready for mesh dispatch.
    """

    def __init__(self) -> None:
        self._registry = AgentCapabilityRegistry()
        self._compiler = TaskCompiler()

    def register_agent(
        self,
        agent_id: str,
        tokens: set[str] | frozenset[str],
        *,
        max_throughput: int = 10,
    ) -> None:
        """Advertise an agent's capability tokens and throughput capacity."""
        self._registry.register(agent_id, tokens, max_throughput=max_throughput)

    def deregister_agent(self, agent_id: str) -> None:
        self._registry.deregister(agent_id)

    def update_queue_depth(self, agent_id: str, depth: int) -> None:
        """Report the current inbox depth for *agent_id* to drive load balancing."""
        self._registry.update_queue_depth(agent_id, depth)

    def compile(
        self,
        macro_instruction: str,
        *,
        payload: dict[str, Any] | None = None,
    ) -> CompiledPlan:
        """
        Compile *macro_instruction* into a fully resolved execution plan.

        Each task node is assigned to the least-loaded agent capable of
        satisfying its required tokens.  Nodes with no capable agent receive
        the sentinel ``"unassigned"`` — treat this as a scheduling failure.
        """
        graph = self._compiler.compile(macro_instruction, payload=payload)
        assignments: dict[str, str] = {}

        for node in graph.topological_sort():
            agent_id = self._registry.least_loaded(node.capability_tokens)
            if agent_id is None:
                _log.warning(
                    "no_capable_agent_for_task",
                    extra={
                        "task_id": node.task_id,
                        "operation": node.operation,
                        "required_tokens": sorted(node.capability_tokens),
                    },
                )
                assignments[node.task_id] = "unassigned"
            else:
                assignments[node.task_id] = agent_id
                # Speculatively increment depth so the next node in the same wave
                # prefers a different agent when one is available
                rec = self._registry._agents.get(agent_id)
                if rec is not None:
                    rec.queue_depth += 1

        return CompiledPlan(
            macro_instruction=macro_instruction,
            graph=graph,
            _assignments=assignments,
        )

    def capable_agents(self, tokens: set[str]) -> list[str]:
        """Return IDs of all agents that satisfy *tokens*."""
        return [r.agent_id for r in self._registry.capable_agents(frozenset(tokens))]

    def all_agents(self) -> list[str]:
        return self._registry.all_agents()
