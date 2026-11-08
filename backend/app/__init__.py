"""MusclePro Flask application factory."""
from __future__ import annotations

import logging
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .security import ApiError, csrf_protect, load_current_user
from .store import create_store
from .users import ensure_admin

CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        # Inline style attributes carry CSS custom properties (--mx, --delay…).
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


def create_app(config_overrides: dict | None = None) -> Flask:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    app = Flask(__name__, static_folder=None)
    app.config.from_object(Config)
    if config_overrides:
        app.config.update(config_overrides)
    if not app.config.get("SECRET_KEY"):
        app.config["SECRET_KEY"] = Config.resolve_secret()
    app.config["JSON_SORT_KEYS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 256 * 1024

    # Render terminates TLS at its proxy: trust one hop for client IP/scheme.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)  # type: ignore[method-assign]

    store = create_store(_ConfigView(app.config))
    app.extensions["store"] = store
    ensure_admin(store, app.config["ADMIN_EMAIL"], app.config["ADMIN_PASSWORD"])

    from .routes.auth import bp as auth_bp
    from .routes.catalog import bp as catalog_bp
    from .routes.me import bp as me_bp
    from .routes.admin import bp as admin_bp
    from .routes.workouts import bp as workouts_bp

    for bp in (auth_bp, catalog_bp, me_bp, admin_bp, workouts_bp):
        app.register_blueprint(bp)

    app.before_request(csrf_protect)
    app.before_request(load_current_user)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "storage": store.kind}

    @app.errorhandler(ApiError)
    def api_error(err: ApiError):
        body = {"error": err.code, **err.extra}
        return jsonify(body), err.status

    @app.errorhandler(HTTPException)
    def http_error(err: HTTPException):
        if request.path.startswith("/api/"):
            code = {404: "not_found", 405: "method_not_allowed", 413: "too_large"}.get(
                err.code or 500, "bad_request"
            )
            return jsonify({"error": code}), err.code
        return err

    @app.errorhandler(Exception)
    def unhandled(err: Exception):
        app.logger.exception("Unhandled error")
        return jsonify({"error": "server_error"}), 500

    @app.after_request
    def security_headers(resp):
        resp.headers.setdefault("Content-Security-Policy", CSP)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        resp.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if app.config["COOKIE_SECURE"]:
            resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        if request.path.startswith("/api/"):
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    _register_spa(app)
    return app


def _register_spa(app: Flask) -> None:
    """Serve the Vite build and fall back to index.html for client routes."""
    static_dir = Path(app.config["STATIC_DIR"])

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path: str):
        if path.startswith("api/"):
            raise ApiError("not_found", 404)
        if not static_dir.is_dir():
            return (
                "<h1>MusclePro API</h1><p>Front-end not built. Run "
                "<code>npm run build</code> in <code>frontend/</code>.</p>",
                200,
            )
        target = static_dir / path
        if path and target.is_file() and _inside(static_dir, target):
            resp = send_from_directory(static_dir, path)
            if path.startswith("assets/"):
                resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return resp
        resp = send_from_directory(static_dir, "index.html")
        resp.headers["Cache-Control"] = "no-cache"
        return resp


def _inside(root: Path, target: Path) -> bool:
    try:
        target.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


class _ConfigView:
    """Attribute access over app.config for create_store()."""

    def __init__(self, cfg) -> None:
        self._cfg = cfg

    def __getattr__(self, name: str):
        try:
            return self._cfg[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


__all__ = ["create_app"]
