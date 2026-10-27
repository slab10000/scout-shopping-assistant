"""Meaningful local checks for graph controls, comparison, memory, and HTTP boundaries.

These use the explicitly labeled sample engine or a deliberate bad-output stub.
The live Gemini demonstration is captured separately by run_demo.py.
"""
from copy import deepcopy
from decimal import Decimal
import unittest
import json
from pathlib import Path
import ast
import hashlib
import math
import textwrap

from fastapi.testclient import TestClient
from langgraph.types import Command

from shopping_assistant import (AssistantError, ComparisonAnalysis, Constraints, GeminiBrain, Recommendation, SampleBrain, SearchPlan, SearchStrategy,
    ShoppingService, build_graph, compare_offers, namespace, read_catalog, records, validate_memory)
from webapp import create_app


class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.s = ShoppingService()
        self.user = "test-user"

    def ask(self, text="Find headphones under $150 with noise cancellation.", **kwargs):
        return self.s.start(self.user, text, engine="sample", **kwargs)

    def remember(self, text, approve=True):
        r = self.ask(text, mode="remember")
        if r.get("pending"):
            r = self.s.resume(self.user, r["thread_id"], approve)
        return r

    def test_catalog_has_exact_decimal_totals_and_unknown_shipping(self):
        rows = {r["offer_id"]: r for r in read_catalog()}
        self.assertEqual(len(rows), 110)
        self.assertEqual(len({r["product_id"] for r in rows.values()}), 36)
        self.assertEqual(rows["O002"]["total_price"], "123.99")
        self.assertIsNone(rows["O004"]["shipping_cost"])
        self.assertIsNone(rows["O004"]["total_price"])

    def test_added_models_have_consistent_specs_and_three_retailers(self):
        root = Path(__file__).resolve().parent
        added = json.loads((root / "tools/catalog_expansion.json").read_text())["products"]
        self.assertEqual(len(added), 30)
        rows = read_catalog()
        for product in added:
            offers = [o for o in rows if o["product_id"] == product["product_id"]]
            self.assertEqual(len(offers), 3)
            self.assertEqual(len({o["retailer"] for o in offers}), 3)
            self.assertTrue(any(o["in_stock"] and o["total_price"] is not None for o in offers))
            for key in ["brand", "model", "form_factor", "noise_cancelling", "battery_hours", "color"]:
                self.assertEqual({o[key] for o in offers}, {product[key]})

    def test_added_models_can_be_requested_by_name_and_product_id(self):
        root = Path(__file__).resolve().parent
        products = json.loads((root / "tools/catalog_expansion.json").read_text())["products"]
        for product in products:
            for alias in [product["name"], product["product_id"]]:
                with self.subTest(alias=alias):
                    result = self.ask(f"Compare {alias} offers under $1000. Find the cheapest.")
                    self.assertEqual(result["pending"]["kind"], "purchase_approval")
                    self.assertEqual(result["pending"]["offer"]["product_id"], product["product_id"])
                    self.assertTrue(all(o["product_id"] == product["product_id"] for o in result["offers"]))

    def test_live_planning_binds_exact_filters_for_an_unfamiliar_model(self):
        class StrategyStub(GeminiBrain):
            def __init__(self):
                pass

            def call(self, schema, instruction, payload):
                self.requested_schema = schema
                return schema.model_validate({"query": "Orbit Longplay",
                    "steps": ["Match Orbit Longplay in the CSV.", "Compare known delivered prices."]}).model_dump()

        brain = StrategyStub()
        constraints = Constraints(budget=300, exact_model="Orbit Longplay", condition="new", priority="price").model_dump()
        plan = brain.plan(constraints)
        self.assertIs(brain.requested_schema, SearchStrategy)
        self.assertEqual(plan["filters"], constraints)
        self.assertIsNone(plan["filters"]["form_factor"])
        self.assertIsNone(plan["filters"]["noise_cancelling"])
        self.assertEqual(plan["sort_by"], "price")
        self.assertEqual(plan["limit"], 3)

    def test_equivalent_new_offer_uses_delivered_cost_not_item_price(self):
        r = self.ask("Find new Aura One headphones under $150 with noise cancellation. Find the cheapest.")
        self.assertEqual(r["pending"]["kind"], "purchase_approval")
        ids = [o["offer_id"] for o in r["comparison"]["shortlist"]]
        self.assertIn("O001", ids)
        self.assertNotIn("O002", ids)
        self.assertTrue(all(o["condition"] == "new" for o in r["comparison"]["eligible"]))

    def test_unknown_shipping_cannot_win_and_hard_budget_is_preserved(self):
        r = self.ask("Find new Aura One over-ear headphones under $120 with noise cancellation.")
        self.assertEqual([o["offer_id"] for o in r["comparison"]["shortlist"]], ["O001"])
        self.assertEqual(r["comparison"]["uncertain"][0]["offer_id"], "O004")
        self.assertTrue(all(Decimal(o["total_price"]) <= Decimal("120") for o in r["comparison"]["eligible"]))

    def test_approval_pause_then_rejection_has_no_confirmation(self):
        r = self.ask()
        self.assertFalse(r["confirmed"])
        self.assertEqual(r["next"], ["approve_purchase"])
        r = self.s.resume(self.user, r["thread_id"], False)
        self.assertEqual(r["status"], "CANCELLED")
        self.assertFalse(r["confirmed"])
        self.assertNotIn("confirm_purchase", [e["node"] for e in r["audit_log"]])

    def test_confirm_once_and_reject_repeated_resume(self):
        r = self.ask()
        r = self.s.resume(self.user, r["thread_id"], True)
        self.assertTrue(r["confirmed"])
        self.assertEqual(r["status"], "SIMULATED_CONFIRMED")
        self.assertEqual(sum(e["node"] == "confirm_purchase" for e in r["audit_log"]), 1)
        with self.assertRaises(ValueError):
            self.s.resume(self.user, r["thread_id"], True)

    def test_truthy_string_cannot_approve_purchase_or_memory(self):
        for mode, text in [("shop", "Find headphones under $150."), ("remember", "I generally prefer over-ear headphones.")]:
            r = self.ask(text, mode=mode)
            with self.assertRaises(ValueError):
                self.s.resume(self.user, r["thread_id"], "no")
        self.assertEqual(records(self.s.store, self.user), [])

    def test_clarification_resumes_same_thread_before_search(self):
        r = self.ask("Find new headphones with noise cancellation.")
        self.assertEqual(r["pending"]["kind"], "clarification")
        self.assertNotIn("search_catalog", [e["node"] for e in r["audit_log"]])
        r = self.s.resume(self.user, r["thread_id"], {"text": "My budget is $150."})
        self.assertEqual(r["pending"]["kind"], "purchase_approval")
        self.assertEqual(r["effective_constraints"]["budget"], 150)

    def test_no_matches_and_unsupported_request_do_not_prepare_action(self):
        r = self.ask("Find new headphones under $20 with noise cancellation.")
        self.assertEqual(r["status"], "NO_MATCHES")
        self.assertNotIn("proposed_action", r)
        r = self.ask("Find a laptop under $900.")
        self.assertEqual(r["status"], "UNSUPPORTED")
        self.assertNotIn("search_catalog", [e["node"] for e in r["audit_log"]])

    def test_no_memory_write_before_approval_and_rejection_preserves_store(self):
        r = self.ask("I generally prefer over-ear headphones.", mode="remember")
        self.assertEqual(r["next"], ["approve_memory"])
        self.assertEqual(records(self.s.store, self.user), [])
        r = self.s.resume(self.user, r["thread_id"], False)
        self.assertEqual(r["status"], "MEMORY_REJECTED")
        self.assertEqual(records(self.s.store, self.user), [])

    def test_two_records_used_in_fresh_thread_without_old_approval(self):
        self.remember("I generally prefer over-ear headphones.")
        self.remember("I generally buy new products only.")
        self.assertEqual(len(records(self.s.store, self.user)), 2)
        r = self.ask()
        self.assertEqual(len(r["selected_memories"]), 2)
        self.assertEqual(r["effective_constraints"]["form_factor"], "over-ear")
        self.assertEqual(r["effective_constraints"]["condition"], "new")
        self.assertFalse(r["approved"])
        self.assertFalse(r["confirmed"])
        self.assertNotIn("save_memory", [e["node"] for e in r["audit_log"]])

    def test_memory_changes_results_against_same_goal_without_memory(self):
        self.remember("I generally prefer over-ear headphones.")
        self.remember("I generally buy new products only.")
        without = self.ask("Find the cheapest headphones under $150 with noise cancellation.", use_memory=False)
        with_memory = self.ask("Find the cheapest headphones under $150 with noise cancellation.")
        self.assertNotEqual(without["recommendation"]["offer_id"], with_memory["recommendation"]["offer_id"])
        best = next(o for o in with_memory["comparison"]["shortlist"] if o["offer_id"] == with_memory["recommendation"]["offer_id"])
        self.assertEqual(best["form_factor"], "over-ear")
        self.assertEqual(best["condition"], "new")
        self.assertEqual(Decimal(best["total_price"]), min(Decimal(o["total_price"]) for o in with_memory["comparison"]["eligible"]))

    def test_correction_keeps_provenance_and_retrieves_only_active_record(self):
        old = self.remember("I generally buy new products only.")
        before = deepcopy(records(self.s.store, self.user)[0])
        new = self.remember("From now on, refurbished products are acceptable.")
        history = records(self.s.store, self.user, history=True)
        self.assertEqual(len(history), 2)
        superseded = next(r for r in history if r["memory_id"] == old["memory_id"])
        self.assertEqual(superseded["superseded_by"], new["memory_id"])
        self.assertEqual(superseded["source_thread"], before["source_thread"])
        self.assertEqual(superseded["approved_at"], before["approved_at"])
        r = self.ask()
        self.assertEqual(r["effective_constraints"]["condition"], "any")
        self.assertEqual(len(r["selected_memories"]), 1)

    def test_rejected_correction_retains_earlier_preference(self):
        self.remember("I generally buy new products only.")
        self.remember("From now on, refurbished products are acceptable.", approve=False)
        self.assertEqual(records(self.s.store, self.user)[0]["value"], "new")
        self.assertEqual(len(records(self.s.store, self.user, history=True)), 1)

    def test_temporary_exception_overrides_thread_without_changing_memory(self):
        self.remember("I generally buy new products only.")
        r = self.ask("Find headphones under $150. Refurbished is acceptable for this purchase.")
        self.assertEqual(r["effective_constraints"]["condition"], "any")
        self.assertEqual(records(self.s.store, self.user)[0]["value"], "new")
        r = self.remember("Refurbished is acceptable for this purchase.")
        self.assertEqual(r["status"], "NOT_STORED")
        self.assertEqual(len(records(self.s.store, self.user)), 1)

    def test_duplicate_preference_does_not_create_another_active_record(self):
        first = self.remember("I generally prefer over-ear headphones.")
        second = self.remember("I generally prefer over-ear headphones.")
        self.assertEqual(first["memory_id"], second["memory_id"])
        self.assertEqual(second["status"], "MEMORY_UNCHANGED")
        self.assertEqual(len(records(self.s.store, self.user)), 1)

    def test_user_namespace_and_thread_owner_boundaries(self):
        self.remember("I generally buy new products only.")
        r = self.s.start("another-user", "Find headphones under $150.", engine="sample")
        self.assertEqual(r["selected_memories"], [])
        with self.assertRaises(ValueError):
            self.s.resume(self.user, r["thread_id"], True)
        self.assertEqual(records(self.s.store, "another-user"), [])

    def test_sensitive_and_temporary_candidates_are_not_saved(self):
        for text in ["My roommate has a medical issue.", "The API returned error 503 right now."]:
            r = self.remember(text)
            self.assertIn(r["status"], {"NOT_STORED", "REVIEW_REQUIRED"})
        self.assertEqual(records(self.s.store, self.user), [])

    def test_fresh_service_clears_in_memory_records_and_checkpoints(self):
        self.remember("I generally prefer over-ear headphones.")
        fresh = ShoppingService()
        self.assertEqual(records(fresh.store, self.user), [])
        self.assertEqual(fresh.app.get_state(fresh.config("brand-new")).values, {})

    def test_hallucinated_offer_and_changed_plan_are_blocked(self):
        class BadRecommendation(SampleBrain):
            def recommend(self, request, preferences, comparison, constraints):
                return {"offer_id": "INVENTED", "summary": "Bad output", "explanation": "Invalid choice.", "reasons": [], "tradeoffs": []}
        self.s.sample = BadRecommendation()
        r = self.ask()
        self.assertEqual(r["status"], "ERROR")
        self.assertIsNone(r["pending"])
        class BadPlan(SampleBrain):
            def plan(self, constraints):
                p = super().plan(constraints)
                p["filters"]["budget"] = 999
                return p
        self.s.sample = BadPlan()
        r = self.ask()
        self.assertEqual(r["status"], "ERROR")
        self.assertNotIn("search_catalog", [e["node"] for e in r["audit_log"]])

    def test_comparison_and_recommendation_receive_request_preferences_and_prior_output(self):
        class RecordingBrain(SampleBrain):
            def compare(self, request, preferences, offers, constraints, candidates):
                self.comparison_input = deepcopy((request, preferences, offers, constraints, candidates))
                self.analysis = super().compare(request, preferences, offers, constraints, candidates)
                return self.analysis

            def recommend(self, request, preferences, comparison, constraints):
                self.recommendation_input = deepcopy((request, preferences, comparison, constraints))
                return super().recommend(request, preferences, comparison, constraints)

        self.remember("I generally prefer over-ear headphones.")
        self.remember("I generally buy new products only.")
        brain = RecordingBrain()
        self.s.sample = brain
        request = "Find the cheapest headphones under $150 with noise cancellation."
        r = self.ask(request)
        received_request, preferences, offers, constraints, candidates = brain.comparison_input
        self.assertEqual(received_request, request)
        self.assertEqual({m["key"] for m in preferences}, {"form_factor", "condition"})
        self.assertTrue(all(m["applied"] for m in preferences))
        self.assertEqual(offers, r["offers"])
        self.assertEqual(len(offers), 110)
        self.assertEqual(constraints, r["effective_constraints"])
        self.assertEqual({o["offer_id"] for o in candidates}, {o["offer_id"] for o in r["comparison"]["analysis"]["offers"]})
        self.assertEqual(brain.recommendation_input[0], request)
        self.assertEqual(brain.recommendation_input[1], preferences)
        self.assertEqual(brain.recommendation_input[2]["analysis"], brain.analysis)
        self.assertTrue(r["recommendation"]["explanation"])

    def test_live_comparison_and_recommendation_use_separate_structured_calls(self):
        class CaptureBrain(GeminiBrain):
            def __init__(self):
                self.calls = []

            def call(self, schema, instruction, payload):
                self.calls.append((schema, deepcopy(payload)))
                if schema is ComparisonAnalysis:
                    return SampleBrain().compare(payload["request"], payload["preferences"],
                        payload["search_results"], payload["effective_constraints"], payload["eligible_shortlist"])
                comparison = {"shortlist": payload["candidates"], "analysis": payload["comparison"]}
                return SampleBrain().recommend(payload["request"], payload["preferences"], comparison,
                    payload["effective_constraints"])

        r = self.ask()
        brain = CaptureBrain()
        preferences = [{"key": "condition", "value": "new", "applied": True}]
        analysis = brain.compare(r["request"], preferences, r["offers"], r["effective_constraints"], r["comparison"]["shortlist"])
        comparison = {**r["comparison"], "analysis": analysis}
        recommendation = brain.recommend(r["request"], preferences, comparison, r["effective_constraints"])
        self.assertEqual([schema for schema, _ in brain.calls], [ComparisonAnalysis, Recommendation])
        self.assertEqual(brain.calls[0][1]["search_results"], r["offers"])
        self.assertEqual(brain.calls[1][1]["comparison"], analysis)
        self.assertEqual(brain.calls[1][1]["request"], r["request"])
        self.assertEqual(brain.calls[1][1]["preferences"], preferences)
        self.assertTrue(recommendation["explanation"])

    def test_invented_duplicate_or_missing_comparison_ids_stop_before_recommendation(self):
        for mutation in ["invented", "duplicate", "missing"]:
            class BadComparison(SampleBrain):
                def compare(self, *args):
                    result = super().compare(*args)
                    if mutation == "invented":
                        result["offers"][0]["offer_id"] = "INVENTED"
                    elif mutation == "duplicate":
                        result["offers"][-1] = deepcopy(result["offers"][0])
                    else:
                        result["offers"].pop()
                    return result

            with self.subTest(mutation=mutation):
                self.s.sample = BadComparison()
                r = self.ask()
                self.assertEqual(r["status"], "ERROR")
                self.assertIsNone(r["pending"])
                self.assertNotIn("proposed_action", r)
                self.assertNotIn("recommend", [e["node"] for e in r["audit_log"]])

    def test_no_matches_skips_model_comparison_and_recommendation(self):
        class NoModelComparison(SampleBrain):
            def compare(self, *args):
                raise AssertionError("No eligible offers must not trigger model comparison")

            def recommend(self, *args):
                raise AssertionError("No eligible offers must not trigger recommendation")

        self.s.sample = NoModelComparison()
        r = self.ask("Find headphones under $1.")
        self.assertEqual(r["status"], "NO_MATCHES")
        self.assertNotIn("analysis", r["comparison"])

    def test_comparison_provider_error_does_not_fall_back_or_prepare_action(self):
        class FailedComparison(SampleBrain):
            def compare(self, *args):
                raise AssistantError("Comparison provider unavailable.")

        self.s.sample = FailedComparison()
        r = self.ask()
        self.assertEqual(r["status"], "ERROR")
        self.assertEqual(r["error"], "Comparison provider unavailable.")
        self.assertIsNone(r["pending"])
        self.assertNotIn("proposed_action", r)

    def test_actual_graph_contains_branches_and_public_state_has_no_key(self):
        graph = self.s.architecture()
        self.assertEqual(len(graph["nodes"]), 20)
        self.assertTrue(any(e["conditional"] for e in graph["edges"]))
        self.s.key = "private-test-key"
        r = self.ask()
        self.assertNotIn("private-test-key", str(r))

    def test_http_boundaries_and_frontend_assets(self):
        with TestClient(create_app(self.s)) as client:
            self.assertEqual(client.get("/").status_code, 200)
            self.assertEqual(client.get("/static/app.js").status_code, 200)
            self.assertEqual(client.get("/api/meta").json()["catalog_offers"], 110)
            self.assertEqual(client.post("/api/runs", json={"request":"Find headphones under $150."}, headers={"Origin":"https://untrusted.example"}).status_code, 403)
            self.assertEqual(client.post("/api/runs", json={"request":"Find headphones under $150."}).status_code, 400)
            self.assertNotIn("api_key", str(client.get("/api/meta").json()))

    def test_native_diagram_matches_the_compiled_graph_and_every_node(self):
        root = Path(__file__).resolve().parent
        manifest = json.loads((root / "static/architecture/scout-native.json").read_text())
        graph = self.s.architecture()
        self.assertEqual(manifest["mermaid"], graph["mermaid"])
        self.assertEqual(set(manifest["nodes"]), set(graph["nodes"]))
        self.assertEqual(set(manifest["diagram"]["bounds"]), set(graph["nodes"]))
        png = (root / "static/architecture/scout-native.png").read_bytes()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(hashlib.sha256(png).hexdigest(), manifest["diagram"]["image_sha256"])
        x, y, width, height = manifest["diagram"]["view_box"]
        for key, bounds in manifest["diagram"]["bounds"].items():
            with self.subTest(node=key):
                self.assertTrue(all(math.isfinite(v) for v in bounds.values()))
                self.assertGreater(bounds["width"], 0)
                self.assertGreater(bounds["height"], 0)
                self.assertGreaterEqual(bounds["x"], x)
                self.assertGreaterEqual(bounds["y"], y)
                self.assertLessEqual(bounds["x"] + bounds["width"], x + width)
                self.assertLessEqual(bounds["y"] + bounds["height"], y + height)

    def test_node_inspector_source_is_current_actual_python_without_runtime_secrets(self):
        root = Path(__file__).resolve().parent
        source = (root / "shopping_assistant.py").read_text()
        lines = source.splitlines(keepends=True)
        manifest = json.loads((root / "static/architecture/scout-native.json").read_text())
        self.assertEqual(hashlib.sha256(source.encode()).hexdigest(), manifest["source_sha256"])
        self.assertEqual(set(manifest["node_details"]), set(self.s.architecture()["nodes"]))
        snippets = [manifest["construction"], manifest["state_schema"]]
        for detail in manifest["node_details"].values():
            snippets += [detail, *detail["helpers"], *detail.get("routing", [])]
        for snippet in snippets:
            with self.subTest(source=snippet["name"], line=snippet["line"]):
                actual = textwrap.dedent("".join(lines[snippet["line"]-1:snippet["end_line"]])).rstrip()
                self.assertEqual(snippet["code"], actual)
                ast.parse(snippet["code"])
        self.assertEqual(manifest["node_details"]["search_catalog"]["name"], "search")
        self.assertEqual(manifest["node_details"]["compare_offers"]["name"], "compare")
        self.assertEqual(manifest["node_details"]["__start__"]["kind"], "builtin")
        self.assertEqual(manifest["node_details"]["__end__"]["kind"], "builtin")
        self.s.key = "private-test-key"
        with TestClient(create_app(self.s)) as client:
            response = client.get("/static/architecture/scout-native.json")
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(self.s.key, response.text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
