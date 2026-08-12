#!/bin/bash
# Runs after any Edit/Write - auto-formats and lints touched Python files
if command -v ruff &> /dev/null; then
  ruff check --fix . 2>/dev/null
  ruff format . 2>/dev/null
fi
exit 0
