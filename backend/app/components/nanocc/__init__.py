"""NanoCC Integration Module.

This module provides integration with NanoCC AI service for protein folding
analysis with Chain-of-Thought (CoT) streaming.

Components:
- client.py: NanoCC API client for real service communication
- folding.py: Folding service that orchestrates mock/real NanoCC
- mock.py: Mock NanoCC service for testing without real backend

Usage:
    from app.components.nanocc import generate_cot_events

    async for event in generate_cot_events(task_id, sequence):
        yield event
"""

from .folding import generate_cot_events, generate_mock_cot_events

__all__ = [
    "generate_cot_events",
    "generate_mock_cot_events",
]
