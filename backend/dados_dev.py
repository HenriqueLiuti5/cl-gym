"""Enche uma conta de desenvolvimento com meses de dados inventados (treinos, cargas, peso,
alimentação, água e metas), para ver a tela de Evolução cheia sem treinar de verdade.

    uv run python -m backend.dados_dev                      # conta do "Entrar como dev"
    uv run python -m backend.dados_dev --email x@exemplo.com --semanas 26

Só roda em banco SQLite (o local) e usa a mesma identidade do "Entrar como dev" (`dev:<e-mail>`):
por padrão, o `ADMIN_EMAIL`. Os números saem de uma semente fixa e não são de ninguém de verdade.
Também cria três contas de amigos de exemplo (com atividade variada, uma delas bloqueada) e dois
convites, para a área de administração ter o que mostrar.

Pode rodar de novo: os treinos gerados são regravados (mesmos ids e versão nova; o que sobrar de
uma rodada anterior vira excluído) e o app baixa tudo na próxima sincronização. O que não foi
gerado aqui fica como está: registros do dia já lançados, metas já definidas e o perfil (nome,
altura e idade só são preenchidos se estiverem vazios).
"""

import argparse
import random
import sys
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta, timezone

from sqlmodel import Session, col, select

from backend.auth import IdentidadeGoogle
from backend.conta import copiar_fichas_modelo, entrar
from backend.convites import VALIDADE
from backend.models import (
    Convite,
    Exercicio,
    Ficha,
    FichaExercicio,
    Meta,
    RegistroDiario,
    Serie,
    Sessao,
    Usuario,
)
from backend.sync import proxima_versao

FUSO = timezone(timedelta(hours=-3))  # Brasília (sem horário de verão desde 2019)
NAMESPACE_GERADOS = uuid.UUID("d5d175e4-5a8d-4bbd-8180-9662b02dd4f2")
# Iguais aos de frontend/src/lib/ids.ts: estes ids precisam bater com os que o app gera.
NAMESPACE_REGISTRO_DIARIO = uuid.UUID("3c5b8f0e-2a4d-4f6b-9e1a-7d2c6b9a0f13")
NAMESPACE_METAS = uuid.UUID("d398a7b8-d44e-49d6-8104-b0586e9eac28")
# Até quantos treinos gerados procurar quando sobram de uma rodada anterior.
MAX_SESSOES = 3000

# Carga inicial (kg) por grupo muscular; halteres valem por mão.
CARGA_INICIAL = {
    "Peito": 32,
    "Costas": 42,
    "Ombro": 10,
    "Bíceps": 12,
    "Tríceps": 16,
    "Posterior de ombro": 8,
    "Quadríceps": 60,
    "Posterior de coxa": 30,
    "Panturrilha": 40,
}
GRUPOS_PEQUENOS = {"Ombro", "Bíceps", "Tríceps", "Posterior de ombro"}


def id_registro_diario(usuario_id: uuid.UUID, dia: date) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE_REGISTRO_DIARIO, f"{usuario_id}:{dia.isoformat()}")


def id_meta(usuario_id: uuid.UUID, tipo: str, exercicio_id: uuid.UUID | None = None) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE_METAS, f"{usuario_id}:{tipo}:{exercicio_id or ''}")


def id_gerado(usuario_id: uuid.UUID, *partes: object) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE_GERADOS, ":".join(str(p) for p in (usuario_id, *partes)))


@dataclass
class Progressao:
    """Carga atual de um exercício e quantas reps além do alvo a 1ª série está saindo."""

    carga: float
    passo: float
    folga: int = -1
    historico: list[tuple[date, float]] = field(default_factory=list)


@dataclass
class Resumo:
    treinos: int = 0
    series: int = 0
    registros: int = 0
    metas: int = 0
    excluidos: int = 0


class Gerador:
    def __init__(self, session: Session, usuario: Usuario, semanas: int, semente: int) -> None:
        self.session = session
        self.usuario = usuario
        self.rng = random.Random(semente)
        self.hoje = datetime.now(FUSO).date()
        self.inicio = self.hoje - timedelta(weeks=semanas)
        self.semanas = semanas
        self.agora = datetime.now(UTC)
        self.versao = proxima_versao(session)
        self.resumo = Resumo()
        self.progressao: dict[uuid.UUID, Progressao] = {}
        self.exercicios = {e.id: e for e in session.exec(select(Exercicio)).all()}
        # Semana "de férias" (quase sem treino e com o peso subindo um pouco).
        self.semana_ferias = semanas * 3 // 5

    # --- Treinos ----------------------------------------------------------------------------

    def _nova_progressao(self, exercicio_id: uuid.UUID) -> Progressao:
        exercicio = self.exercicios[exercicio_id]
        nome = exercicio.nome.lower()
        base = CARGA_INICIAL.get(exercicio.grupo_muscular, 20) * self.rng.uniform(0.85, 1.2)
        if "leg press" in nome:
            base, passo = base * 2.3, 10.0
        elif "halter" in nome:
            base, passo = base * 0.45, 2.0
        elif exercicio.grupo_muscular in GRUPOS_PEQUENOS:
            passo = 1.0
        else:
            passo = 2.5
        return Progressao(carga=max(passo, round(base / passo) * passo), passo=passo)

    def _dias_de_treino(self) -> list[date]:
        segunda = self.inicio - timedelta(days=self.inicio.weekday())
        pesos_do_dia = [1.2, 1.2, 1.1, 1.1, 0.8, 0.5, 0.2]  # segunda a domingo
        dias: list[date] = []
        for semana in range(self.semanas + 1):
            if semana == self.semana_ferias:
                quantos = 1
            else:
                quantos = self.rng.choices([2, 3, 4, 5], weights=[1, 3, 4, 2])[0]
            escolhidos: set[int] = set()
            while len(escolhidos) < quantos:
                escolhidos.add(self.rng.choices(range(7), weights=pesos_do_dia)[0])
            for d in sorted(escolhidos):
                dia = segunda + timedelta(weeks=semana, days=d)
                if self.inicio <= dia < self.hoje:
                    dias.append(dia)
        return dias

    def _horario(self, dia: date, ficha: Ficha) -> tuple[datetime, datetime]:
        periodo = self.rng.choices(["noite", "manha", "tarde"], weights=[6, 3, 1])[0]
        hora, ate = {"noite": (18, 20), "manha": (6, 7), "tarde": (12, 14)}[periodo]
        comeco = datetime.combine(
            dia, time(self.rng.randint(hora, ate), self.rng.randint(0, 59)), FUSO
        )
        minutos = self.rng.gauss(58, 10) + (8 if "leg" in ficha.nome.lower() else 0)
        fim = comeco + timedelta(minutes=min(95, max(35, minutos)))
        return comeco.astimezone(UTC), fim.astimezone(UTC)

    def gerar_treinos(self) -> None:
        u = self.usuario.id
        fichas = self.session.exec(
            select(Ficha)
            .where(Ficha.usuario_id == u, col(Ficha.excluido).is_(False))
            .order_by(col(Ficha.ordem))
        ).all()
        if not fichas:
            return
        itens: dict[uuid.UUID, list[FichaExercicio]] = defaultdict(list)
        for item in self.session.exec(
            select(FichaExercicio)
            .where(FichaExercicio.usuario_id == u, col(FichaExercicio.excluido).is_(False))
            .order_by(col(FichaExercicio.ordem))
        ).all():
            itens[item.ficha_id].append(item)

        ultima: dict[uuid.UUID, date] = {}
        sessoes_novas: set[uuid.UUID] = set()
        series_novas: set[uuid.UUID] = set()
        for n, dia in enumerate(self._dias_de_treino()):
            # Quase sempre a ficha feita há mais tempo (a sugestão do app), às vezes outra.
            por_sugestao = sorted(fichas, key=lambda f: (ultima.get(f.id, date.min), f.ordem))
            ficha = por_sugestao[0] if self.rng.random() < 0.8 else self.rng.choice(fichas)
            ultima[ficha.id] = dia
            comeco, fim = self._horario(dia, ficha)
            sessao_id = id_gerado(u, "sessao", n)
            sessoes_novas.add(sessao_id)
            self._gravar(
                Sessao,
                sessao_id,
                ficha_id=ficha.id,
                iniciada_em=comeco,
                finalizada_em=fim,
                observacao=None,
            )
            self.resumo.treinos += 1
            numero_serie = 0
            depois_das_ferias = dia >= self.inicio + timedelta(weeks=self.semana_ferias)
            for item in itens[ficha.id]:
                exercicio_id = item.exercicio_id
                if item.alternativas and self.rng.random() < 0.12:  # aparelho ocupado: Plano B
                    exercicio_id = self.rng.choice(item.alternativas)
                p = self.progressao.get(exercicio_id)
                if p is None:
                    p = self.progressao[exercicio_id] = self._nova_progressao(exercicio_id)
                if depois_das_ferias and p.historico and p.historico[-1][0] < dia - timedelta(9):
                    p.folga -= 1  # voltou mais fraco depois da pausa
                primeira = max(1, item.alvo_reps + p.folga + self.rng.choice([-1, 0, 0, 0, 1]))
                reps = primeira
                for _ in range(item.series):
                    numero_serie += 1
                    serie_id = id_gerado(u, "serie", n, numero_serie)
                    series_novas.add(serie_id)
                    self._gravar(
                        Serie,
                        serie_id,
                        sessao_id=sessao_id,
                        exercicio_id=exercicio_id,
                        ficha_exercicio_id=item.id,
                        numero=numero_serie,
                        carga_kg=p.carga,
                        repeticoes=reps,
                    )
                    self.resumo.series += 1
                    reps = max(1, reps - self.rng.choice([0, 1, 1, 2]))
                p.historico.append((dia, p.carga))
                # A regra do app: 1ª série com alvo + 2 reps ou mais → sobe o peso.
                if primeira >= item.alvo_reps + 2:
                    p.carga += p.passo
                    p.folga = self.rng.choice([-2, -1])
                elif self.rng.random() < 0.55:
                    p.folga += 1
        self.session.flush()
        self._excluir_sobras(sessoes_novas, series_novas)

    def _excluir_sobras(self, sessoes: set[uuid.UUID], series: set[uuid.UUID]) -> None:
        """Treinos gerados por uma rodada anterior que não existem mais nesta viram excluídos."""
        u = self.usuario.id
        gerados = [id_gerado(u, "sessao", n) for n in range(MAX_SESSOES)]
        sobras_sessoes = self.session.exec(
            select(Sessao).where(
                Sessao.usuario_id == u,
                col(Sessao.id).in_(gerados),
                col(Sessao.id).not_in(sessoes),
                col(Sessao.excluido).is_(False),
            )
        ).all()
        sobras_series = self.session.exec(
            select(Serie).where(
                Serie.usuario_id == u,
                col(Serie.sessao_id).in_(gerados),
                col(Serie.id).not_in(series),
                col(Serie.excluido).is_(False),
            )
        ).all()
        for registro in [*sobras_sessoes, *sobras_series]:
            registro.excluido = True
            registro.atualizado_em = self.agora
            registro.versao = self.versao
            self.resumo.excluidos += 1

    # --- Registro do dia --------------------------------------------------------------------

    def peso_do_dia(self, dia: date) -> float:
        """Peso "verdadeiro" do dia: cai uns 0,3 kg por semana, com a semana de férias no meio."""
        dias = (dia - self.inicio).days
        peso = 86.0 - 0.32 * dias / 7
        ferias = self.inicio + timedelta(weeks=self.semana_ferias)
        if ferias <= dia < ferias + timedelta(days=14):
            peso += 0.7 if dia < ferias + timedelta(days=7) else 0.35
        if dia.weekday() == 0:
            peso += 0.35  # segunda, depois do fim de semana
        return peso

    def gerar_registros(self, treinos: set[date]) -> None:
        u = self.usuario.id
        ja_lancados = set(
            self.session.exec(select(RegistroDiario.data).where(RegistroDiario.usuario_id == u))
        )
        dia = self.inicio
        while dia < self.hoje:
            fim_de_semana = dia.weekday() >= 5
            treinou = dia in treinos
            peso = None
            if self.rng.random() < 0.85:
                peso = round(self.peso_do_dia(dia) + self.rng.gauss(0, 0.28), 1)
            kcal = proteina = carbo = None
            if self.rng.random() < 0.8:  # lançou a comida do dia
                kcal = round(self.rng.gauss(2600 if fim_de_semana else 2080, 220), -1)
                proteina = round(self.rng.gauss(148 + (12 if treinou else 0), 14))
                carbo = round(self.rng.gauss(260 if fim_de_semana else 218, 32))
            agua = None
            if self.rng.random() < 0.75:
                agua = round((self.rng.gauss(2650, 420) + (350 if treinou else 0)) / 50) * 50
            observacao = None
            sorteio = self.rng.random()
            if dia.weekday() == 5 and sorteio < 0.3:
                observacao = "Jogo de basquete"
            elif dia.weekday() == 6 and sorteio < 0.12:
                observacao = "Churrasco de família"
            elif sorteio < 0.03:
                observacao = "Dormiu mal"
            if dia not in ja_lancados and any(
                v is not None for v in (peso, kcal, agua, observacao)
            ):
                self._gravar(
                    RegistroDiario,
                    id_registro_diario(u, dia),
                    data=dia,
                    peso_kg=peso,
                    kcal=None if kcal is None else int(kcal),
                    proteina_g=proteina,
                    carbo_g=carbo,
                    agua_ml=None if agua is None else max(0, int(agua)),
                    observacao=observacao,
                )
                self.resumo.registros += 1
            dia += timedelta(days=1)

    # --- Metas ------------------------------------------------------------------------------

    def _meta(
        self,
        tipo: str,
        valor: float,
        quando: date,
        inicio: float | None = None,
        exercicio_id: uuid.UUID | None = None,
    ) -> None:
        meta_id = id_meta(self.usuario.id, tipo, exercicio_id)
        if self.session.get(Meta, meta_id) is not None:
            return  # já definida (no app ou numa rodada anterior): fica como está
        self._gravar(
            Meta,
            meta_id,
            atualizado_em=datetime.combine(quando, time(8, 0), FUSO).astimezone(UTC),
            tipo=tipo,
            exercicio_id=exercicio_id,
            valor=valor,
            inicio=inicio,
        )
        self.resumo.metas += 1

    def gerar_metas(self) -> None:
        antes = self.hoje - timedelta(weeks=min(10, self.semanas))
        self._meta("peso", 78.0, antes, inicio=round(self.peso_do_dia(antes), 1))
        for tipo, valor in (
            ("kcal", 2200),
            ("proteina", 150),
            ("carbo", 230),
            ("agua", 3000),
            ("treinos_semana", 4),
        ):
            self._meta(tipo, valor, self.inicio)

        # Carga: uma meta já alcançada (o app comemora) e duas ainda pela frente, nos exercícios
        # mais feitos.
        mais_feitos = sorted(self.progressao.items(), key=lambda par: -len(par[1].historico))
        alcancada = False
        pela_frente = 0
        for exercicio_id, p in mais_feitos:
            if len(p.historico) < 6:
                break

            def recorde_ate(dia: date, p: Progressao = p) -> float:
                return max((c for d, c in p.historico if d <= dia), default=0)

            recorde = max(c for _, c in p.historico)
            seis_semanas = self.hoje - timedelta(weeks=6)
            if not alcancada and 0 < recorde_ate(seis_semanas) < recorde:
                self._meta(
                    "carga",
                    recorde,
                    seis_semanas,
                    inicio=recorde_ate(seis_semanas),
                    exercicio_id=exercicio_id,
                )
                alcancada = True
            elif pela_frente < 2:
                quatro_semanas = self.hoje - timedelta(weeks=4)
                self._meta(
                    "carga",
                    recorde + 2 * p.passo,
                    quatro_semanas,
                    inicio=recorde_ate(quatro_semanas) or None,
                    exercicio_id=exercicio_id,
                )
                pela_frente += 1
            if alcancada and pela_frente == 2:
                break

    # --- Gravação ---------------------------------------------------------------------------

    def _gravar(self, modelo: type, id_: uuid.UUID, **campos: object) -> None:
        campos.setdefault("atualizado_em", self.agora)
        self.session.merge(
            modelo(
                id=id_,
                usuario_id=self.usuario.id,
                versao=self.versao,
                excluido=False,
                **campos,
            )
        )


def gerar(session: Session, email: str, semanas: int = 20, semente: int = 7) -> Resumo:
    """Gera (ou regera) os dados da conta de dev do e-mail e devolve o que foi gravado."""
    usuario, _ = entrar(session, IdentidadeGoogle(f"dev:{email}", email, "Dev"))
    usuario.nome = usuario.nome or "Dev"
    usuario.altura_cm = usuario.altura_cm or 178
    usuario.idade = usuario.idade or 28
    copiar_fichas_modelo(session, usuario.id)

    gerador = Gerador(session, usuario, semanas, semente)
    gerador.gerar_treinos()
    dias_de_treino = {d for p in gerador.progressao.values() for d, _ in p.historico}
    gerador.gerar_registros(dias_de_treino)
    gerador.gerar_metas()
    session.commit()
    return gerador.resumo


@dataclass(frozen=True)
class Amigo:
    """Conta de exemplo para a área de administração (só atividade; ninguém de verdade)."""

    email: str
    nome: str
    entrou_ha: timedelta
    visto_ha: timedelta
    aparelho: str
    instalado: bool
    bloqueado_ha: timedelta | None
    # Há quantos dias terminou cada treino.
    treinos: tuple[int, ...]


AMIGOS = (
    Amigo(
        "marina@exemplo.com",
        "Marina",
        timedelta(days=41),
        timedelta(minutes=3),
        "iPhone",
        True,
        None,
        (1, 3, 5, 8, 10, 12, 15, 17, 22, 26, 33, 38),
    ),
    Amigo(
        "rafael@exemplo.com",
        "Rafael",
        timedelta(days=24),
        timedelta(days=4),
        "Android",
        False,
        None,
        (4, 9, 13, 20),
    ),
    Amigo(
        "bruno@exemplo.com",
        "Bruno",
        timedelta(days=60),
        timedelta(days=11),
        "Computador",
        False,
        timedelta(days=2),
        (35, 50),
    ),
)
# Códigos fixos (do alfabeto dos convites) para rodar de novo sem criar outros.
CONVITE_VALIDO = ("K7QMX4PD", uuid.uuid5(NAMESPACE_GERADOS, "convite-valido"))
CONVITE_USADO = ("H3RTW9ZB", uuid.uuid5(NAMESPACE_GERADOS, "convite-usado"))


def gerar_amigos(session: Session) -> tuple[int, int]:
    """Cria (ou atualiza) as contas de exemplo e dois convites: um que ainda vale e um que a
    Marina usou. As contas usam a identidade do "Entrar como dev" (`dev:<e-mail>`): dá para
    entrar como elas (o Bruno está bloqueado). Devolve (contas, convites)."""
    agora = datetime.now(UTC)
    versao = proxima_versao(session)
    contas: dict[str, Usuario] = {}
    for amigo in AMIGOS:
        usuario, _ = entrar(
            session, IdentidadeGoogle(f"dev:{amigo.email}", amigo.email, amigo.nome)
        )
        usuario.altura_cm = usuario.altura_cm or 172
        usuario.idade = usuario.idade or 27
        usuario.criado_em = agora - amigo.entrou_ha
        usuario.visto_em = agora - amigo.visto_ha
        usuario.aparelho = amigo.aparelho
        usuario.instalado = amigo.instalado
        usuario.bloqueado_em = agora - amigo.bloqueado_ha if amigo.bloqueado_ha else None
        fichas = session.exec(
            select(Ficha).where(Ficha.usuario_id == usuario.id).order_by(col(Ficha.ordem))
        ).all()
        for n, dias in enumerate(amigo.treinos):
            fim = agora - timedelta(days=dias)
            session.merge(
                Sessao(
                    id=id_gerado(usuario.id, "treino-amigo", n),
                    usuario_id=usuario.id,
                    versao=versao,
                    atualizado_em=agora,
                    excluido=False,
                    ficha_id=fichas[n % len(fichas)].id if fichas else None,
                    iniciada_em=fim - timedelta(minutes=58),
                    finalizada_em=fim,
                )
            )
        contas[amigo.email] = usuario

    marina = contas["marina@exemplo.com"]
    codigo, convite_id = CONVITE_VALIDO
    session.merge(
        Convite(
            id=convite_id,
            codigo=codigo,
            criado_em=agora - timedelta(hours=1),
            expira_em=agora - timedelta(hours=1) + VALIDADE,
        )
    )
    codigo, convite_id = CONVITE_USADO
    session.merge(
        Convite(
            id=convite_id,
            codigo=codigo,
            criado_em=marina.criado_em - timedelta(hours=2),
            expira_em=marina.criado_em - timedelta(hours=2) + VALIDADE,
            usado_em=marina.criado_em,
            usado_por=marina.id,
        )
    )
    session.commit()
    return len(contas), 2


def _email_padrao() -> str | None:
    from backend.config import Settings

    try:
        admin = Settings().admin_email.strip()
    except ValueError:
        return None
    return admin or None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--email", help="conta (padrão: o ADMIN_EMAIL)")
    parser.add_argument("--semanas", type=int, default=20, help="quantas semanas para trás")
    parser.add_argument("--semente", type=int, default=7, help="muda os números sorteados")
    args = parser.parse_args(argv)

    from backend.config import DatabaseSettings
    from backend.db import get_engine

    if not DatabaseSettings().sqlalchemy_url.startswith("sqlite"):
        print("Só roda em banco SQLite (o local), para não encher a nuvem.", file=sys.stderr)
        return 1
    email = (args.email or _email_padrao() or "").strip().lower()
    if not email:
        print("Informe a conta com --email (ou ADMIN_EMAIL no .env).", file=sys.stderr)
        return 1
    if not 1 <= args.semanas <= 104:
        print("--semanas vai de 1 a 104.", file=sys.stderr)
        return 1

    with Session(get_engine()) as session:
        resumo = gerar(session, email, args.semanas, args.semente)
        amigos, convites = gerar_amigos(session)
    print(
        f"{email}: {resumo.treinos} treinos ({resumo.series} séries), "
        f"{resumo.registros} registros do dia e {resumo.metas} metas novas"
        + (
            f"; {resumo.excluidos} sobras de antes marcadas como excluídas."
            if resumo.excluidos
            else "."
        )
    )
    print(f"Área de administração: {amigos} contas de amigos de exemplo e {convites} convites.")
    print("No app, toque em Sincronizar (aba Conta) ou recarregue a página.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
