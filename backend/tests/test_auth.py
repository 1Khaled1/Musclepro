from .conftest import register


def test_health(api):
    r = api.get("/api/health")
    assert r.status_code == 200
    assert r.json["storage"] == "memory"


def test_register_login_logout_flow(api):
    r = register(api, lang="fr", level="pro")
    assert r.status_code == 201
    user = r.json["user"]
    assert user["email"] == "ana@example.com"
    assert user["lang"] == "fr" and user["level"] == "pro"
    assert "password_hash" not in user
    assert "mp_session" in r.headers["Set-Cookie"]
    assert "HttpOnly" in r.headers["Set-Cookie"]

    assert api.get("/api/auth/me").json["user"]["id"] == user["id"]

    api.post("/api/auth/logout")
    assert api.get("/api/auth/me").json["user"] is None

    r = api.post("/api/auth/login", json={"email": "ANA@example.com ", "password": "Strong1234"})
    assert r.status_code == 200
    assert api.get("/api/auth/me").json["user"]["id"] == user["id"]


def test_duplicate_email_rejected(api):
    assert register(api).status_code == 201
    r = register(api, email="Ana@Example.com")
    assert r.status_code == 409
    assert r.json["error"] == "email_taken"


def test_password_rules(api):
    assert register(api, password="short1").json["error"] == "password_length"
    assert register(api, password="lettersonly").json["error"] == "password_weak"
    assert register(api, email="nope").json["error"] == "email_invalid"


def test_wrong_password_is_generic(api):
    register(api)
    api.post("/api/auth/logout")
    r = api.post("/api/auth/login", json={"email": "ana@example.com", "password": "Wrong1234"})
    assert r.status_code == 401 and r.json["error"] == "invalid_credentials"
    r = api.post("/api/auth/login", json={"email": "ghost@example.com", "password": "Wrong1234"})
    assert r.status_code == 401 and r.json["error"] == "invalid_credentials"


def test_csrf_header_required(client):
    r = client.post("/api/auth/register", json={"email": "x@example.com", "password": "Strong1234"})
    assert r.status_code == 403
    assert r.json["error"] == "csrf_failed"


def test_password_change_invalidates_other_sessions(app, api):
    register(api)
    other = app.test_client()
    other.post(
        "/api/auth/login",
        json={"email": "ana@example.com", "password": "Strong1234"},
        headers={"X-Requested-With": "MusclePro"},
    )
    assert other.get("/api/auth/me").json["user"] is not None

    r = api.post("/api/me/password", json={"current": "Strong1234", "new": "Newer12345"})
    assert r.status_code == 200
    # This browser keeps a fresh session, the other one is signed out.
    assert api.get("/api/auth/me").json["user"] is not None
    assert other.get("/api/auth/me").json["user"] is None


def test_profile_update_validation(api):
    register(api)
    r = api.patch("/api/me", json={"level": "pro", "unit": "lbs", "lang": "fr", "name": "  Ana   B "})
    assert r.status_code == 200
    assert r.json["user"]["unit"] == "lbs"
    assert r.json["user"]["name"] == "Ana B"
    assert api.patch("/api/me", json={"level": "god"}).json["error"] == "level_invalid"


def test_delete_account(api):
    register(api)
    assert api.delete("/api/me", json={"password": "bad"}).status_code == 403
    assert api.delete("/api/me", json={"password": "Strong1234"}).status_code == 200
    assert api.get("/api/auth/me").json["user"] is None
    # The e-mail is free again.
    assert register(api).status_code == 201


def test_rate_limit(app, api):
    app.config["AUTH_RATE_LIMIT"] = 3
    for _ in range(3):
        api.post("/api/auth/login", json={"email": "a@b.co", "password": "x"})
    r = api.post("/api/auth/login", json={"email": "a@b.co", "password": "x"})
    assert r.status_code == 429


def test_security_headers(api):
    r = api.get("/api/health")
    assert "frame-ancestors 'none'" in r.headers["Content-Security-Policy"]
    assert r.headers["X-Content-Type-Options"] == "nosniff"
