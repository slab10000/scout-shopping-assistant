"""Capture actual Project 1 scenarios, using local sample rules or a running Gemini server.

python run_demo.py                         # labeled sample engine
python run_demo.py --server http://127.0.0.1:8000 --engine gemini
"""
import argparse
import json
from pathlib import Path
import time
from uuid import uuid4

import httpx
from shopping_assistant import ROOT, ShoppingService, records


class RemoteService:
    def __init__(self, server, request_delay=0):
        self.client = httpx.Client(base_url=server, timeout=55)
        self.request_delay = request_delay

    def wait(self, response):
        response.raise_for_status()
        job_id = response.json()["job_id"]
        deadline = time.monotonic() + 160
        while time.monotonic() < deadline:
            data = self.client.get(f"/api/jobs/{job_id}", params={"user_id": self.user_id}).json()
            if data["state"] == "error":
                raise RuntimeError(data["error"])
            if data["state"] == "complete":
                return data["result"]
            time.sleep(.3)
        raise TimeoutError("Scenario exceeded its execution limit.")

    def start(self, user_id, request, mode="shop", engine="sample", use_memory=True):
        self.user_id = user_id
        if engine == "gemini" and self.request_delay:
            time.sleep(self.request_delay)
        return self.wait(self.client.post("/api/runs", json={"user_id":user_id,"request":request,"mode":mode,"engine":engine,"use_memory":use_memory}))

    def resume(self, user_id, thread_id, value):
        self.user_id = user_id
        return self.wait(self.client.post(f"/api/runs/{thread_id}/resume",json={"user_id":user_id,"value":value}))

    def memory(self, user_id):
        return self.client.get("/api/memories", params={"user_id":user_id}).json()["records"]


def demonstrate(service, engine="sample", user_id="demo-student", on_record=None, existing=None):
    results, checks = dict(existing or {}), []
    def record(name, result, expected):
        results[name] = result
        if result.get("error"):
            if on_record:
                on_record(results, checks + [f"FAIL {name}: {result['error']}"])
            raise RuntimeError(result["error"])
        assert result["status"] == expected, (name, result["status"], expected)
        line = f"PASS {name}: expected={expected}; actual={result['status']}; thread={result['thread_id'][:8]}; engine={result['engine_label']}"
        checks.append(line)
        print(line, flush=True)
        if on_record:
            on_record(results, checks)

    def case(name, expected, action):
        prior = results.get(name, {})
        if prior.get("status") == expected and not prior.get("error"):
            record(name, prior, expected)
            return prior
        result = action()
        record(name, result, expected)
        return result

    goal = "Find the cheapest wireless headphones under $150 with noise cancellation."
    r = case("normal_paused", "WAITING_APPROVAL", lambda: service.start(user_id, goal, engine=engine, use_memory=False))
    case("normal_approved", "SIMULATED_CONFIRMED", lambda: service.resume(user_id,r["thread_id"],True))
    for name,text in [("fit","I generally prefer over-ear headphones."),("condition","I generally buy new products only.")]:
        r = case("memory_"+name+"_paused", "MEMORY_PROPOSED", lambda: service.start(user_id,text,mode="remember",engine=engine))
        case("memory_"+name+"_saved", "MEMORY_SAVED", lambda: service.resume(user_id,r["thread_id"],True))
    r = case("later_using_two_memories", "WAITING_APPROVAL", lambda: service.start(user_id,goal,engine=engine))
    assert len(r["selected_memories"]) == 2
    assert r["effective_constraints"]["condition"] == "new"
    assert r["effective_constraints"]["form_factor"] == "over-ear"
    case("purchase_rejected", "CANCELLED", lambda: service.resume(user_id,r["thread_id"],False))
    r = case("correction_paused", "MEMORY_PROPOSED", lambda: service.start(user_id,"From now on, refurbished products are acceptable.",mode="remember",engine=engine))
    case("correction_saved", "MEMORY_SAVED", lambda: service.resume(user_id,r["thread_id"],True))
    r = case("later_after_correction", "WAITING_APPROVAL", lambda: service.start(user_id,goal,engine=engine))
    assert r["effective_constraints"]["condition"] == "any"
    case("temporary_not_saved", "NOT_STORED", lambda: service.start(user_id,"Refurbished is acceptable for this purchase.",mode="remember",engine=engine))
    r = case("memory_rejection_paused", "MEMORY_PROPOSED", lambda: service.start(user_id,"I generally prefer in-ear headphones.",mode="remember",engine=engine))
    case("memory_rejected", "MEMORY_REJECTED", lambda: service.resume(user_id,r["thread_id"],False))
    case("no_matching_offer", "NO_MATCHES", lambda: service.start(user_id,"Find new headphones under $20 with noise cancellation.",engine=engine))
    results["memory_history"] = service.memory(user_id) if isinstance(service,RemoteService) else records(service.store,user_id,True)
    assert len([m for m in results["memory_history"] if m["status"]=="active"]) == 2
    assert len(results["memory_history"]) == 3
    before=results["normal_paused"]["recommendation"]["offer_id"]
    after=results["later_using_two_memories"]["recommendation"]["offer_id"]
    assert before != after
    checks.append(f"PASS memory comparison: without={before}; with={after}; corrected condition=any")
    return results, checks


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server")
    parser.add_argument("--engine", choices=["sample","gemini"], default="sample")
    parser.add_argument("--output-dir", default=str(ROOT/"evidence"/"sample"))
    parser.add_argument("--request-delay", type=float, default=25, help="Seconds between live starts to respect model rate limits")
    parser.add_argument("--continue-evidence", action="store_true", help="Continue saved scenarios in the same running server without repeating approved writes")
    args = parser.parse_args()
    if args.engine=="gemini" and not args.server:
        parser.error("Use --server to run live Gemini with the key held by the webapp.")
    folder = Path(args.output_dir)
    folder.mkdir(parents=True,exist_ok=True)
    def capture(results, checks):
        (folder/"scenarios.json").write_text(json.dumps(results,indent=2),encoding="utf-8")
        (folder/"scenario_output.txt").write_text("\n".join(checks)+"\n",encoding="utf-8")
    service = RemoteService(args.server,args.request_delay) if args.server else ShoppingService()
    existing = json.loads((folder/"scenarios.json").read_text()) if args.continue_evidence else None
    user_id = existing["normal_paused"]["user_id"] if existing else "demo-"+uuid4().hex[:10]
    if existing and (not args.server or not service.memory(user_id)):
        parser.error("Continue requires the same running server with its original memory. Otherwise run a fresh demonstration.")
    metadata = {"engine": args.engine, "user_id": user_id,
                "model": service.client.get('/api/meta').json()['model'] if args.server else 'sample-rules',
                "continued_from_saved_states": bool(existing)}
    (folder/'run_metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    results, checks = demonstrate(service,args.engine,user_id,on_record=capture,existing=existing)
    capture(results,checks)
    graph = service.client.get("/api/architecture").json() if args.server else service.architecture()
    (folder/"graph.mmd").write_text(graph["mermaid"],encoding="utf-8")
    print(f"Saved {len(results)-1} actual scenario states to {folder}")
