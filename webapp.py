"""Local FastAPI frontend for the real Python LangGraph assistant."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import getpass
import os
from pathlib import Path
import threading
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, SecretStr, StrictBool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from shopping_assistant import AssistantError, MODEL, ROOT, ShoppingService, read_catalog, records


class RunRequest(BaseModel):
    user_id: str = Field(default="shopper-001", pattern=r"^[a-zA-Z0-9_-]{1,60}$")
    request: str = Field(min_length=1, max_length=2000)
    mode: str = Field(default="shop", pattern=r"^(shop|remember)$")
    engine: str = Field(default="gemini", pattern=r"^(gemini|sample)$")
    use_memory: bool = True


class ResumeRequest(BaseModel):
    user_id: str = Field(default="shopper-001", pattern=r"^[a-zA-Z0-9_-]{1,60}$")
    value: StrictBool | dict


class ConnectionRequest(BaseModel):
    api_key: SecretStr = Field(min_length=5, max_length=500)
    model: str = Field(default=MODEL, pattern=r"^[a-zA-Z0-9._-]{1,100}$")


def create_app(service=None):
    service = service or ShoppingService()
    app = FastAPI(title="Scout · Project 1", docs_url=None, redoc_url=None)
    app.state.service = service
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
    executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="scout")
    jobs, jobs_lock = {}, threading.Lock()

    @app.middleware("http")
    async def local_origin(request: Request, call_next):
        origin = request.headers.get("origin")
        if request.method not in {"GET", "HEAD", "OPTIONS"} and origin:
            parsed = urlparse(origin)
            if parsed.netloc != request.headers.get("host") or parsed.scheme not in {"http", "https"}:
                return JSONResponse({"detail": "Only this local app may submit requests."}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store" if request.url.path.startswith("/api/") else "no-cache"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'"
        return response

    @app.exception_handler(AssistantError)
    async def model_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.exception_handler(ValueError)
    async def invalid_request(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    def submit(user_id, thread_id, task):
        with jobs_lock:
            if len(jobs) >= 250:
                raise HTTPException(429, "This demo has reached its run limit. Restart to clear in-memory data.")
            job_id = uuid4().hex
            jobs[job_id] = {"state": "running", "user_id": user_id, "thread_id": thread_id}
        def work():
            try:
                result = task()
                with jobs_lock:
                    jobs[job_id].update(state="complete", result=result)
            except (AssistantError, ValueError) as exc:
                with jobs_lock:
                    jobs[job_id].update(state="error", error=str(exc))
            except Exception:
                with jobs_lock:
                    jobs[job_id].update(state="error", error="The workflow could not finish. No unapproved action was taken.")
        executor.submit(work)
        return {"job_id": job_id, "thread_id": thread_id}

    @app.get("/api/meta")
    def meta():
        rows = read_catalog(service.catalog_path)
        return {"connected": bool(service.key), "model": service.model, "catalog_offers": len(rows),
                "products": len({r["product_id"] for r in rows}), "retailers": len({r["retailer"] for r in rows}),
                "data_mode": "Sample CSV", "memory_backend": "InMemoryStore", "checkpoint_backend": "InMemorySaver"}

    @app.post("/api/settings")
    def settings(data: ConnectionRequest):
        service.connect(data.api_key.get_secret_value(), data.model)
        return {"connected": True, "model": service.model}

    @app.get("/api/catalog")
    def catalog():
        return {"offers": read_catalog(service.catalog_path), "source": "headphones.csv", "simulated": True}

    @app.get("/api/architecture")
    def architecture():
        return service.architecture()

    @app.get("/api/memories")
    def memories(user_id: str = "shopper-001"):
        with service.lock:
            return {"records": records(service.store, user_id, history=True), "namespace": ["users", user_id, "shopping"]}

    @app.post("/api/runs")
    def run(data: RunRequest):
        # Fail before scheduling if no live credentials are configured.
        service.brain(data.engine)
        thread_id = uuid4().hex
        return submit(data.user_id, thread_id, lambda: service.start(**data.model_dump(), thread_id=thread_id))

    @app.get("/api/jobs/{job_id}")
    def job(job_id: str, user_id: str = "shopper-001"):
        with jobs_lock:
            value = dict(jobs.get(job_id, {}))
        if not value or value["user_id"] != user_id:
            raise HTTPException(404, "Run not found for this user.")
        if value["state"] == "running" and service.owners.get(value["thread_id"]) == user_id:
            value["result"] = service.snapshot(user_id, value["thread_id"])
        return value

    @app.post("/api/runs/{thread_id}/resume")
    def resume(thread_id: str, data: ResumeRequest):
        service.snapshot(data.user_id, thread_id)
        return submit(data.user_id, thread_id, lambda: service.resume(data.user_id, thread_id, data.value))

    @app.get("/api/runs/{thread_id}")
    def inspect(thread_id: str, user_id: str = "shopper-001"):
        return service.snapshot(user_id, thread_id)

    @app.get("/")
    def index():
        return FileResponse(ROOT / "static" / "index.html")

    app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
    return app


if __name__ == "__main__":
    import uvicorn
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--prompt-key", action="store_true", help="Read a key without terminal echo; held only in server memory")
    parser.add_argument("--model", default=MODEL)
    args = parser.parse_args()
    key = os.getenv("GOOGLE_API_KEY") or (getpass.getpass("Google API key (hidden): ") if args.prompt_key else None)
    service = ShoppingService(key, args.model)
    print(f"Scout local webapp: http://127.0.0.1:{args.port}")
    uvicorn.run(create_app(service), host="127.0.0.1", port=args.port, log_level="warning")
