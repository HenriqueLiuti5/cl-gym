from fastapi import FastAPI

from backend.routers import sync

app = FastAPI(
    title="CL Gym API",
    version="0.1.0",
    description="Backend do CL Gym: guarda e sincroniza treinos, cargas e exercícios.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.include_router(sync.router)


@app.get("/api/health", tags=["infra"])
def health() -> dict[str, str]:
    """Verificação simples (sem token) para saber se o servidor está no ar."""
    return {"status": "ok"}
