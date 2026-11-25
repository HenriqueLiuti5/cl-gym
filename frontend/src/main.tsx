import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { App } from "./App";
import "./index.css";
// Escuta o pedido de instalação do Chrome desde o início (ele pode chegar antes da tela de login).
import "./lib/instalar";

// Service worker: deixa o app abrir sem internet e se atualiza sozinho quando há versão nova.
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
