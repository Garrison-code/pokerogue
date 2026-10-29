#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Garrison-code
# SPDX-License-Identifier: AGPL-3.0-only
"""Use the normal static verifier over production's private ingress."""
import runpy
from production_network import use_private_ingress

if __name__ == "__main__":
    use_private_ingress()
    runpy.run_path("container/check_static.py", run_name="__main__")
