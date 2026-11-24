import { useEffect, useState } from "react";

import { Botao, Cartao, Titulo } from "../componentes/ui";

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
}

export function ComoInstalar({ voltar }: { voltar: string }) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const instalado = window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    window.addEventListener("beforeinstallprompt", aoOferecer);
    return () => window.removeEventListener("beforeinstallprompt", aoOferecer);
  }, []);

  return (
    <div className="space-y-4">
      <Titulo voltar={voltar}>Como instalar</Titulo>
      {instalado && <p className="rounded-xl bg-emerald-950 px-3 py-2 text-emerald-300">O app já está instalado neste celular. ✓</p>}
      <p className="text-slate-300">
        O CL Gym não está na loja de apps: ele é instalado pelo navegador, de graça, e funciona sem internet.
      </p>

      {evento && (
        <Botao variante="principal" className="w-full" onClick={() => evento.prompt()}>
          Instalar agora
        </Botao>
      )}

      <Cartao className="space-y-2">
        <h2 className="text-lg font-semibold">Android (Chrome)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-slate-300">
          <li>Abra o link do app no <strong>Chrome</strong>.</li>
          <li>Toque em <strong>Instalar app</strong>, se aparecer, ou no menu <strong>⋮</strong> → <strong>Adicionar à tela inicial</strong>.</li>
          <li>Confirme. O ícone do CL Gym aparece junto dos outros apps.</li>
        </ol>
      </Cartao>

      <Cartao className="space-y-2">
        <h2 className="text-lg font-semibold">iPhone (Safari)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-slate-300">
          <li>Abra o link no <strong>Safari</strong> (não funciona pelo Chrome nem pelo WhatsApp).</li>
          <li>Toque no botão de <strong>compartilhar</strong> (o quadrado com a seta para cima).</li>
          <li>Role e toque em <strong>Adicionar à Tela de Início</strong> → <strong>Adicionar</strong>.</li>
        </ol>
      </Cartao>

      <Cartao className="space-y-2 text-sm text-slate-400">
        <p>Os treinos ficam guardados no celular e vão para a nuvem quando tem internet: ao abrir o app, ao terminar um treino e quando a conexão volta.</p>
        <p>O app se atualiza sozinho na próxima vez que você abrir com internet.</p>
      </Cartao>
    </div>
  );
}
