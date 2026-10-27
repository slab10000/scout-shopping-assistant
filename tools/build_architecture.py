"""Export the native LangGraph image, its node positions, and actual Python source.

python tools/build_architecture.py            # refresh source locally, no network
python tools/build_architecture.py --render   # redraw using LangGraph / Mermaid.INK
"""
from __future__ import annotations

import argparse
import ast
import base64
import hashlib
import json
from pathlib import Path
import re
import struct
import sys
import textwrap
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from shopping_assistant import ShoppingService

ASSETS = ROOT / "static" / "architecture"
SOURCE = ROOT / "shopping_assistant.py"
SVG = "{http://www.w3.org/2000/svg}"


def source_records(source, graph_nodes):
    """Read functions and the actual node registry, without executing node bodies."""
    tree = ast.parse(source)
    lines = source.splitlines(keepends=True)
    top = {n.name: n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.ClassDef))}
    builder = top["build_graph"]
    nested = {n.name: n for n in builder.body if isinstance(n, ast.FunctionDef)}
    registry = next(n for n in builder.body if isinstance(n, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == "nodes" for t in n.targets))
    bindings = {key.value: value.id for key, value in zip(registry.value.keys, registry.value.values)}

    def record(node, name=None):
        return {"name": name or getattr(node, "name", "graph construction"),
                "file": SOURCE.name, "line": node.lineno, "end_line": node.end_lineno,
                "code": textwrap.dedent("".join(lines[node.lineno - 1:node.end_lineno])).rstrip()}

    def lookup(name):
        if "." in name:
            cls, method = name.split(".", 1)
            node = next(n for n in top[cls].body if isinstance(n, ast.FunctionDef) and n.name == method)
        else:
            node = nested.get(name) or top[name]
        return record(node, name)

    edges = [n for n in builder.body if isinstance(n, ast.Expr) and isinstance(n.value, ast.Call)
             and isinstance(n.value.func, ast.Attribute) and n.value.func.attr in {"add_edge", "add_conditional_edges"}]
    start = next(n for n in edges if isinstance(n.value.args[0], ast.Name) and n.value.args[0].id == "START")
    end = next(n for n in builder.body if isinstance(n, ast.For)
               and any(isinstance(c, ast.Name) and c.id == "END" for c in ast.walk(n)))
    brain_methods = {"understand": "understand", "plan_search": "plan", "compare_offers": "compare",
                     "recommend": "recommend", "form_memory": "form_memory"}
    details = {}
    for key in graph_nodes:
        if key in {"__start__", "__end__"}:
            details[key] = {**record(start if key == "__start__" else end, key),
                            "kind": "builtin", "reads": [], "writes": [], "helpers": []}
            continue
        node = nested[bindings[key]]
        called = {c.func.id for c in ast.walk(node) if isinstance(c, ast.Call) and isinstance(c.func, ast.Name)}
        helper_names = sorted((called & set(top)) - {"AssistantError", "build_graph"})
        if key in brain_methods:
            method = brain_methods[key]
            helper_names += [f"GeminiBrain.{method}", f"SampleBrain.{method}"]
        routes = [n for n in edges if isinstance(n.value.args[0], ast.Constant) and n.value.args[0].value == key]
        for route in routes:
            if len(route.value.args) > 1 and isinstance(route.value.args[1], ast.Name):
                helper_name = route.value.args[1].id
                if helper_name in nested:
                    helper_names.append(helper_name)
        reads = {c.slice.value for c in ast.walk(node) if isinstance(c, ast.Subscript)
                 and isinstance(c.value, ast.Name) and c.value.id == "s"
                 and isinstance(c.slice, ast.Constant) and isinstance(c.slice.value, str)}
        reads.update(c.args[0].value for c in ast.walk(node) if isinstance(c, ast.Call)
                     and isinstance(c.func, ast.Attribute) and isinstance(c.func.value, ast.Name)
                     and c.func.value.id == "s" and c.func.attr == "get" and c.args
                     and isinstance(c.args[0], ast.Constant) and isinstance(c.args[0].value, str))
        writes = {k.value for c in ast.walk(node) if isinstance(c, ast.Return) and isinstance(c.value, ast.Dict)
                  for k in c.value.keys if isinstance(k, ast.Constant) and isinstance(k.value, str)}
        if "event" in called:
            writes.add("audit_log")
        details[key] = {**record(node), "kind": "function", "reads": sorted(reads), "writes": sorted(writes),
                        "helpers": [lookup(n) for n in dict.fromkeys(helper_names)],
                        "routing": [record(n, "Conditional routing" if n.value.func.attr == "add_conditional_edges" else "Next edge") for n in routes]}
    end_line = builder.end_lineno
    construction = {"name": "build_graph", "file": SOURCE.name, "line": registry.lineno,
                    "end_line": end_line, "code": textwrap.dedent("".join(lines[registry.lineno-1:end_line])).rstrip()}
    return details, construction, record(top["ShoppingState"])


def native_positions(svg, graph_nodes):
    """Take click regions from Mermaid's rendered geometry, not a hand-made layout."""
    root = ET.fromstring(svg)
    view_box = [float(v) for v in root.attrib["viewBox"].split()]
    bounds = {}
    for group in root.iter(SVG + "g"):
        if "node" not in group.attrib.get("class", "").split():
            continue
        match = re.search(r"flowchart-(.+)-\d+$", group.attrib["id"])
        if not match or match[1] not in graph_nodes:
            raise ValueError("Unexpected node in native Mermaid rendering.")
        key = match[1]
        translation = re.fullmatch(r"translate\(([-\d.]+),\s*([-\d.]+)\)", group.attrib["transform"])
        if not translation:
            raise ValueError("Unexpected Mermaid node transform.")
        cx, cy = map(float, translation.groups())
        rect = next((child for child in group if child.tag == SVG + "rect"), None)
        if rect is not None:
            x, y, width, height = [float(rect.attrib[n]) for n in ["x", "y", "width", "height"]]
        else:
            # Mermaid's START/END stadium shapes use absolute cubic path points.
            path = next(group.iter(SVG + "path"))
            commands = re.sub(r"[-+]?(?:\d*\.)?\d+(?:e[+-]?\d+)?|[\s,]", "", path.attrib["d"], flags=re.I)
            if not set(commands) <= set("MCLZ"):
                raise ValueError("Unsupported stadium path; inspect the new renderer before updating positions.")
            numbers = list(map(float, re.findall(r"-?(?:\d*\.)?\d+(?:e[+-]?\d+)?", path.attrib["d"], re.I)))
            xs, ys = numbers[::2], numbers[1::2]
            x, y, width, height = min(xs), min(ys), max(xs)-min(xs), max(ys)-min(ys)
        bounds[key] = {"x": round(cx+x, 5), "y": round(cy+y, 5),
                       "width": round(width, 5), "height": round(height, 5),
                       "radius": round(height/2 if key.startswith("__") else 5, 5)}
    if set(bounds) != set(graph_nodes):
        raise ValueError("Native rendering must contain every compiled node.")
    return view_box, bounds


def build(render=False, image_source=None):
    graph = ShoppingService().app.get_graph()
    mermaid = graph.draw_mermaid()
    nodes = list(graph.nodes)
    path = ASSETS / "scout-native.json"
    existing = json.loads(path.read_text()) if path.exists() else None
    ASSETS.mkdir(parents=True, exist_ok=True)
    if render:
        import requests
        encoded = base64.b64encode(mermaid.encode()).decode("ascii")
        response = requests.get(f"https://mermaid.ink/svg/{encoded}?bgColor=%21white", timeout=25)
        response.raise_for_status()
        view_box, bounds = native_positions(response.content, nodes)
        png = Path(image_source).read_bytes() if image_source else graph.draw_mermaid_png()
        if png[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("Expected native LangGraph PNG.")
        width, height = struct.unpack(">II", png[16:24])
        if abs(width-view_box[2]) > 1 or abs(height-view_box[3]) > 1:
            raise ValueError("PNG and native SVG geometry do not agree.")
        (ASSETS / "scout-native.png").write_bytes(png)
        diagram = {"image": "/static/architecture/scout-native.png", "view_box": view_box,
                   "pixel_width": width, "pixel_height": height, "bounds": bounds,
                   "image_sha256": hashlib.sha256(png).hexdigest()}
    else:
        if not existing or existing["mermaid"] != mermaid:
            raise ValueError("Graph layout changed. Run python tools/build_architecture.py --render.")
        diagram = existing["diagram"]
    source = SOURCE.read_text()
    details, construction, state_schema = source_records(source, nodes)
    result = {"generator": "LangGraph draw_mermaid_png / native Mermaid node geometry",
              "mermaid": mermaid, "nodes": nodes, "diagram": diagram,
              "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
              "node_details": details, "construction": construction, "state_schema": state_schema}
    path.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Exported native diagram and actual source for {len(details)} nodes. No LLM calls.")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--image-source", type=Path, help="Reuse an existing native PNG with matching SVG geometry.")
    args = parser.parse_args()
    build(args.render, args.image_source)
