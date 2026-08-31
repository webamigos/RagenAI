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


def accept_loop(srv: socket.socket, internal_port: int, label: str) -> None:
    print(f"Port forwarder ({label}) listening on :{srv.getsockname()[1]} -> 127.0.0.1:{internal_port}")
    while True:
        client, _ = srv.accept()
        threading.Thread(target=handle, args=(client, internal_port), daemon=True).start()


def serve(listen_port: int, internal_port: int) -> None:
    listeners = []

    # Bind IPv6 (Railway internal networking uses IPv6)
    try:
        srv6 = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        srv6.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv6.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        srv6.bind(("::", listen_port))
        srv6.listen(128)
        listeners.append(("IPv6", srv6))
    except OSError as e:
        print(f"IPv6 bind failed: {e}", file=sys.stderr)

    # Bind IPv4
    try:
        srv4 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv4.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv4.bind(("", listen_port))
        srv4.listen(128)
        listeners.append(("IPv4", srv4))
    except OSError as e:
        print(f"IPv4 bind failed: {e}", file=sys.stderr)

    if not listeners:
        print("Failed to bind any port forwarder socket", file=sys.stderr)
        sys.exit(1)

    # Run each listener in its own thread
    threads = []
    for label, srv in listeners:
        t = threading.Thread(target=accept_loop, args=(srv, internal_port, label), daemon=True)
        t.start()
        threads.append(t)

    # Block forever
    for t in threads:
        t.join()


if __name__ == "__main__":
    serve(int(sys.argv[1]), int(sys.argv[2]))
