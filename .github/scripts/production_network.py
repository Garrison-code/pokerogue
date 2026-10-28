# SPDX-FileCopyrightText: 2026 Garrison-code
# SPDX-License-Identifier: AGPL-3.0-only
"""Reach production through Tailscale without changing its TLS hostname."""
import socket

SITE_HOST = "pokerogue.garrix.cloud"
PRIVATE_IP = "100.64.67.54"

def use_private_ingress():
    original = socket.getaddrinfo
    def resolve(host, *args, **kwargs):
        return original(PRIVATE_IP if host == SITE_HOST else host, *args, **kwargs)
    socket.getaddrinfo = resolve
