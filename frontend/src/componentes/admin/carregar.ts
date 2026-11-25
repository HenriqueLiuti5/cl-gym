// Carregamento das telas de administração: tudo vem do servidor (nada fica no celular), então
// precisa de internet. Recarrega sozinho quando a internet volta e ao voltar para o app.

import { useCallback, useEffect, useState } from "react";

import { ErroApi } from "../../lib/api";

/** Frase para a tela, a partir do erro da API. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) {
    if (erro.status === 0) {
      return navigator.onLine === false
        ? "Precisa de internet para isto."
        : "O servidor não respondeu agora. Tente de novo.";
    }
    if (erro.status === 403 && erro.motivo !== "bloqueado") return "Só o administrador acessa esta área.";
    return erro.message;
  }
  return "Algo deu errado. Tente de novo.";
}

interface Estado<T> {
  dados?: T;
  erro?: string;
  carregando: boolean;
  /** Quando os dados chegaram (para mostrar "Atualizado às 18:42"). */
  quando?: number;
}

export function useCarregar<T>(carregar: () => Promise<T>) {
  const [versao, setVersao] = useState(0);
  const [estado, setEstado] = useState<Estado<T>>({ carregando: true });

  useEffect(() => {
    let ativo = true;
    carregar().then(
      (dados) => {
        if (ativo) setEstado({ dados, carregando: false, quando: Date.now() });
      },
      (erro: unknown) => {
        if (ativo) setEstado((atual) => ({ ...atual, erro: mensagemDeErro(erro), carregando: false }));
      },
    );
    return () => {
      ativo = false;
    };
  }, [carregar, versao]);

  const recarregar = useCallback(() => {
    setEstado((atual) => ({ ...atual, carregando: true }));
    setVersao((v) => v + 1);
  }, []);

  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") recarregar();
    };
    window.addEventListener("online", recarregar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.removeEventListener("online", recarregar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [recarregar]);

  return { ...estado, recarregar };
}

/** A hora atual, renovada de tempos em tempos (para "Ativo agora" e "Expira em 3 h" andarem). */
export function useAgora(intervalo = 30_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), intervalo);
    return () => clearInterval(relogio);
  }, [intervalo]);
  return agora;
}
