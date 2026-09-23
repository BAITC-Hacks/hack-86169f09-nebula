import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .ai import configured, enhance, provider
from .catalog import ROOT, load_catalog
from .models import SearchQuery, SearchRequest
from .search import search


def create_app(catalog_path=None):
    path = Path(catalog_path or os.getenv("CONTRACTORS_PATH", ROOT / "data" / "contractors.csv"))
    if not path.is_absolute():
        path = ROOT / path

    @asynccontextmanager
    async def lifespan(app):
        app.state.catalog = load_catalog(path)
        yield

    app = FastAPI(title="EventMatch AI — Contractor API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware,
                       allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(","),
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.get("/api/health")
    def health():
        return {"status": "ok", "profiles": len(app.state.catalog), "ai_configured": configured(),
                "ai_provider": provider()}

    @app.get("/api/catalog")
    def catalog():
        return {"source": path.name, "items": [c.model_dump(mode="json") for c in app.state.catalog]}

    @app.post("/api/search")
    def lookup(body: SearchRequest):
        profiles = body.contractors if body.contractors is not None else app.state.catalog
        query = SearchQuery.model_validate(body.model_dump(exclude={"contractors", "use_ai"}))
        result = search(profiles, query)
        result["dataset_source"] = "request_catalog" if body.contractors is not None else path.name
        return enhance(result, query) if body.use_ai else result

    @app.get("/", include_in_schema=False)
    def page():
        return FileResponse(ROOT / "index.html", headers={"Cache-Control": "no-cache"})

    @app.get("/app.js", include_in_schema=False)
    def script():
        return FileResponse(ROOT / "app.js", media_type="text/javascript", headers={"Cache-Control": "no-cache"})

    @app.get("/api-client.js", include_in_schema=False)
    def client_script():
        return FileResponse(ROOT / "api-client.js", media_type="text/javascript", headers={"Cache-Control": "no-cache"})

    @app.get("/styles.css", include_in_schema=False)
    def styles():
        return FileResponse(ROOT / "styles.css", media_type="text/css", headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
