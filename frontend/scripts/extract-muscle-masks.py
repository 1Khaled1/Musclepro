"""Statically extract FRONT_MUSCLES / BACK_MUSCLES literals from the js-rich
bundle into JSON (no third-party code is executed)."""
import json, re, sys

src = open(sys.argv[1], encoding="utf-8").read()
out = {}
for name in ("FRONT_MUSCLES", "BACK_MUSCLES"):
    start = src.index(f"var {name} = [") + len(f"var {name} = ")
    depth, i = 0, start
    in_str = False
    while True:
        c = src[i]
        if in_str:
            if c == "\\": i += 1
            elif c == '"': in_str = False
        elif c == '"': in_str = True
        elif c == "[": depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0: break
        i += 1
    lit = src[start:i + 1]
    assert "(" not in re.sub(r'"[^"]*"', '""', lit), "unexpected code in data literal"
    js = re.sub(r'(?m)^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', lit)
    js = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', js)
    js = re.sub(r',(\s*[}\]])', r'\1', js)
    out[name] = json.loads(js)
json.dump({"front": out["FRONT_MUSCLES"], "back": out["BACK_MUSCLES"]}, open(sys.argv[2], "w"), separators=(",", ":"))
for k, v in (("front", out["FRONT_MUSCLES"]), ("back", out["BACK_MUSCLES"])):
    print(k, len(v), sorted({(m["group"], m["gender"]) for m in v})[:6], "...")
    print("  keys:", sorted(v[0].keys()))
