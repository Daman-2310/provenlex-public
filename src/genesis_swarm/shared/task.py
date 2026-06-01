from __future__ import annotations

import asyncio
import logging
from asyncio import Task, create_task
from collections.abc import Coroutine
from typing import TypeVar

_log = logging.getLogger(__name__)

T = TypeVar("T")


def fire(coro: Coroutine, *, name: str = "") -> Task:
    """Create a tracked background task that logs unhandled exceptions.

    Use this instead of raw ``asyncio.create_task()`` everywhere in the
    codebase so no task exception is ever silently lost.
    """
    task = create_task(coro, name=name)
    task.add_done_callback(_on_done)
    return task


def _on_done(task: Task) -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        _log.error(
            "background_task_failed",
            task_name=task.get_name() or task.get_coro().__qualname__,
            exc_info=exc,
        )
