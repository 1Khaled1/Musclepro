from .conftest import register


def login(api, email, password):
    return api.post("/api/auth/login", json={"email": email, "password": password})


def test_admin_bootstrapped_and_guarded(api):
    register(api)  # regular user
    assert api.get("/api/admin/users").status_code == 403
    api.post("/api/auth/logout")
    assert api.get("/api/admin/users").status_code == 401

    assert login(api, "admin@musclepro.test", "AdminPass123").status_code == 200
    users = api.get("/api/admin/users").json["users"]
    assert {u["email"] for u in users} == {"admin@musclepro.test", "ana@example.com"}
    assert all("password_hash" not in u for u in users)
    stats = api.get("/api/admin/stats").json
    assert stats["users"] == 2 and stats["admins"] == 1


def test_admin_manage_user(app, api):
    uid = register(api).json["user"]["id"]
    api.post("/api/auth/logout")
    login(api, "admin@musclepro.test", "AdminPass123")

    r = api.patch(f"/api/admin/users/{uid}", json={"role": "coach"})
    assert r.json["user"]["role"] == "coach"
    assert api.patch(f"/api/admin/users/{uid}", json={"role": "king"}).status_code == 400

    # Suspending a user blocks login.
    api.patch(f"/api/admin/users/{uid}", json={"active": False})
    other = app.test_client()
    r = other.post(
        "/api/auth/login",
        json={"email": "ana@example.com", "password": "Strong1234"},
        headers={"X-Requested-With": "MusclePro"},
    )
    assert r.status_code == 403 and r.json["error"] == "account_disabled"

    assert api.delete(f"/api/admin/users/{uid}").status_code == 200
    assert api.get(f"/api/admin/users").json["users"][0]["email"] == "admin@musclepro.test"


def test_last_admin_protected(api):
    login(api, "admin@musclepro.test", "AdminPass123")
    me = api.get("/api/auth/me").json["user"]["id"]
    assert api.patch(f"/api/admin/users/{me}", json={"role": "user"}).json["error"] == "cannot_modify_self"
    assert api.delete(f"/api/admin/users/{me}").json["error"] == "cannot_modify_self"


def test_spa_fallback(app, client, tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>spa</html>")
    app.config["STATIC_DIR"] = str(dist)
    # The route closes over the dir at creation, so rebuild for this check.
    from app import create_app

    app2 = create_app({"TESTING": True, "SECRET_KEY": "another-test-secret-key-long-enough-hs256", "STATIC_DIR": str(dist)})
    c = app2.test_client()
    assert b"spa" in c.get("/programs/foundation-full-body").data
    assert c.get("/api/unknown").status_code == 404
    assert c.get("/../../etc/passwd").status_code in (200, 404)
