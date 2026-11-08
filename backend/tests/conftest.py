import pytest

from app import create_app
from app.security import limiter

HEADERS = {"X-Requested-With": "MusclePro"}


@pytest.fixture()
def app(tmp_path):
    limiter.reset()
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test-secret-key-that-is-long-enough-for-hs256",
            "STATIC_DIR": str(tmp_path / "dist"),
            "ADMIN_EMAIL": "admin@musclepro.test",
            "ADMIN_PASSWORD": "AdminPass123",
            "AUTH_RATE_LIMIT": 1000,
        }
    )
    yield app


@pytest.fixture()
def client(app):
    return app.test_client()


class Api:
    """Thin wrapper adding the CSRF header to every call."""

    def __init__(self, client):
        self.c = client

    def get(self, url, **kw):
        return self.c.get(url, headers=HEADERS, **kw)

    def post(self, url, json=None, **kw):
        return self.c.post(url, json=json, headers=HEADERS, **kw)

    def patch(self, url, json=None, **kw):
        return self.c.patch(url, json=json, headers=HEADERS, **kw)

    def put(self, url, json=None, **kw):
        return self.c.put(url, json=json, headers=HEADERS, **kw)

    def delete(self, url, json=None, **kw):
        return self.c.delete(url, json=json, headers=HEADERS, **kw)


@pytest.fixture()
def api(client):
    return Api(client)


def register(api, email="ana@example.com", password="Strong1234", **extra):
    body = {"email": email, "password": password, "name": "Ana", **extra}
    return api.post("/api/auth/register", json=body)
