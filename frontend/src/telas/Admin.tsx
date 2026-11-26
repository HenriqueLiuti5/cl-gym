// Área de administração (#/admin), só para a conta do ADMIN_EMAIL (o servidor confere em toda
// chamada). Fica dentro da aba Conta. Precisa de internet: nada daqui é guardado no celular.

import { AdminConvites } from "../componentes/admin/Convites";
import { AdminUsuarios } from "../componentes/admin/Usuarios";
import { BarraTopo, Segmentos } from "../componentes/ui";
import { PARTES_ADMIN } from "../lib/navegacao";
import type { Usuario } from "../lib/tipos";

export function Admin({ usuario, aba }: { usuario: Usuario; aba?: string }) {
  const atual = aba === "convites" ? "convites" : "usuarios";
  return (
    <div>
      <BarraTopo titulo="Administração" voltar="#/conta" />
      <div data-fixo-na-troca="segmentos" className="mb-3">
        <Segmentos opcoes={PARTES_ADMIN} escolhido={atual} link={(id) => `#/admin/${id}`} rotulo="Partes da administração" />
      </div>
      {/* Só esta parte desliza ao trocar entre Usuários e Convites (Palco.tsx). */}
      <div data-pagina>{atual === "usuarios" ? <AdminUsuarios usuario={usuario} /> : <AdminConvites />}</div>
    </div>
  );
}
