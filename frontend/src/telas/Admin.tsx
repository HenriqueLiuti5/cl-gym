// Área de administração (#/admin), só para a conta do ADMIN_EMAIL (o servidor confere em toda
// chamada). Fica dentro da aba Conta. Precisa de internet: nada daqui é guardado no celular.

import { AdminConvites } from "../componentes/admin/Convites";
import { AdminUsuarios } from "../componentes/admin/Usuarios";
import { BarraTopo, Segmentos } from "../componentes/ui";
import type { Usuario } from "../lib/tipos";

const PARTES = [
  { id: "usuarios", rotulo: "Usuários" },
  { id: "convites", rotulo: "Convites" },
];

export function Admin({ usuario, aba }: { usuario: Usuario; aba?: string }) {
  const atual = aba === "convites" ? "convites" : "usuarios";
  return (
    <div>
      <BarraTopo titulo="Administração" voltar="#/conta" />
      <div className="mb-3">
        <Segmentos opcoes={PARTES} escolhido={atual} link={(id) => `#/admin/${id}`} rotulo="Partes da administração" />
      </div>
      {atual === "usuarios" ? <AdminUsuarios usuario={usuario} /> : <AdminConvites />}
    </div>
  );
}
