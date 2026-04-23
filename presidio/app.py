"""
Custom Presidio Analyzer entry point.
Extends the default Server with Polish PII recognizers that include
checksum validation (NIP, PESEL, REGON) — the built-in recognizers lack this.
"""
import sys
import importlib.util
import os

# Load the original app.py from the Presidio package before our file shadows it.
_spec = importlib.util.spec_from_file_location(
    "_presidio_app",
    os.path.join(os.path.dirname(__file__), "_presidio_app.py"),
)
if _spec is None or _spec.loader is None:
    raise RuntimeError("Cannot locate _presidio_app.py — is the Presidio image intact?")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
OriginalServer = _mod.Server

sys.path.insert(0, os.environ.get('RECOGNIZERS_PATH', '/app/recognizers'))
from pl_recognizers import (  # noqa: E402
    PlNipRecognizer,
    PlPeselRecognizer,
    PlRegonRecognizer,
    PlIdCardRecognizer,
    PlIbanRecognizer,
)


def create_app():
    server = OriginalServer()

    # Built-in PlPeselRecognizer uses the wrong checksum formula.
    server.engine.registry.remove_recognizer('PlPeselRecognizer')

    server.engine.registry.add_recognizer(PlNipRecognizer())
    server.engine.registry.add_recognizer(PlPeselRecognizer())
    server.engine.registry.add_recognizer(PlRegonRecognizer())
    server.engine.registry.add_recognizer(PlIdCardRecognizer())
    server.engine.registry.add_recognizer(PlIbanRecognizer())

    return server.app
