"""TCP port forwarder for Railway IPv4/IPv6 networking.

Listens on all interfaces (IPv4 + IPv6) on $PORT and forwards to
localhost:$INTERNAL_PORT. Replaces socat which is not available in
the docling-serve-cpu image.
"""

import socket
import sys
import threading


def forward(src: socket.socket, dst: socket.socket) -> None:
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        src.close()
        dst.close()


def handle(client: socket.socket, internal_port: int) -> None:
    upstream = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        upstream.connect(("127.0.0.1", internal_port))
    except OSError:
        client.close()
        return
    threading.Thread(target=forward, args=(client, upstream), daemon=True).start()
    threading.Thread(target=forward, args=(upstream, client), daemon=True).start()


def serve(listen_port: int, internal_port: int) -> None:
    # Try dual-stack (IPv4 + IPv6) first, fall back to IPv4-only
    for family in (socket.AF_INET6, socket.AF_INET):
        try:
            srv = socket.socket(family, socket.SOCK_STREAM)
            srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if family == socket.AF_INET6:
                srv.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            srv.bind(("", listen_port))
            srv.listen(128)
            print(f"Port forwarder listening on :{listen_port} -> 127.0.0.1:{internal_port}")
            while True:
                client, _ = srv.accept()
                threading.Thread(target=handle, args=(client, internal_port), daemon=True).start()
        except OSError:
            continue
    print("Failed to bind port forwarder", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    serve(int(sys.argv[1]), int(sys.argv[2]))
