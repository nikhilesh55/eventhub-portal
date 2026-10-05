"""
EventHub - Centralized Logging Layer
Provides structured, readable, and secure application logging across all layers.
Logs are emitted to sys.stdout for local terminal view and Render cloud logging.
Never logs passwords, tokens, session secrets, or sensitive credentials.
"""

import sys
import logging
from typing import Optional

# Configure standard logger
LOGGER_NAME = "eventhub"
logger = logging.getLogger(LOGGER_NAME)

if not logger.handlers:
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)
    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.propagate = False


def log_info(msg: str):
    logger.info(msg)


def log_warning(msg: str):
    logger.warning(msg)


def log_error(msg: str, exc_info: bool = False):
    logger.error(msg, exc_info=exc_info)


# Safe string helper to avoid accidental password/token leakage
def mask_secret(value: Optional[str]) -> str:
    if not value:
        return "[none]"
    return "******"
