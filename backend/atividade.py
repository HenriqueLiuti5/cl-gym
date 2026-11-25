"""Atividade de cada pessoa, para a área de administração: quando foi vista pela última vez, em
que aparelho e se usa o app instalado. Gravada a cada chamada com o token (e no login), com um
limite para não escrever no banco a cada requisição.

Não existe "online agora" de verdade: o app só fala com o servidor ao abrir, depois de salvar,
ao terminar um treino e quando a internet volta. O app mostra "ativo agora" a partir do
`visto_em`.
"""

from datetime import UTC, datetime, timedelta

from sqlmodel import Session

from backend.models import Usuario

# Chamadas seguidas (o envio e o download de uma sincronização) gravam o `visto_em` uma vez só.
INTERVALO_VISTO = timedelta(seconds=60)


def aparelho_do_user_agent(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    for marca in ("iPhone", "iPad", "Android"):
        if marca in user_agent:
            return marca
    return "Computador"


def registrar_atividade(
    session: Session,
    usuario: Usuario,
    user_agent: str | None,
    instalado: str | None,
    agora: datetime | None = None,
    forcar: bool = False,
) -> None:
    """Atualiza `visto_em` (a cada 60 s, ou sempre com `forcar`), `aparelho` (pelo User-Agent) e
    `instalado` (cabeçalho X-App-Instalado: "1" ou "0"; ausente não muda). Só grava se mudou."""
    agora = agora or datetime.now(UTC)
    mudou = False
    if forcar or usuario.visto_em is None or agora - usuario.visto_em >= INTERVALO_VISTO:
        usuario.visto_em = agora
        mudou = True
    aparelho = aparelho_do_user_agent(user_agent)
    if aparelho is not None and aparelho != usuario.aparelho:
        usuario.aparelho = aparelho
        mudou = True
    if instalado in ("0", "1") and (instalado == "1") != usuario.instalado:
        usuario.instalado = instalado == "1"
        mudou = True
    if mudou:
        session.commit()
