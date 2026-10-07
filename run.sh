#!/usr/bin/env bash
# ==============================================================================
# EventHub - 1-Click Launch Script
# ==============================================================================

set -e

echo "=================================================================="
echo "  🎟️  EventHub: Event Booking & QR Check-In Portal"
echo "  Project 05 · Industry Full-Stack Challenge"
echo "=================================================================="

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is required but could not be found."
    exit 1
fi

echo "🔍 Python Version: $(python3 --version)"

# 1. Run unit tests
echo ""
echo "[1/2] Running automated test suite..."
python3 tests/test_api.py

# 2. Launch server
echo ""
echo "[2/2] Launching EventHub server..."
exec python3 app.py
