from fastapi import FastAPI

from backend.routers import admin, auth, conta, convites, modelos, sync

app = FastAPI(
    title="CL Gym API",
    version="0.2.0",
    description="Backend do CL Gym: guarda e sincroniza treinos, cargas e exercícios.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.include_router(auth.router)
app.include_router(conta.router)
app.include_router(sync.router)
app.include_router(modelos.router)
app.include_router(convites.router)
app.include_router(admin.router)


@app.get("/api/health", tags=["infra"])
def health() -> dict[str, str]:
    """Verificação simples (sem token) para saber se o servidor está no ar."""
    return {"status": "ok"}
