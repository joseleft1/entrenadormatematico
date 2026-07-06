import "./storage-polyfill.js"; // debe cargarse ANTES del componente
import React from "react";
import { createRoot } from "react-dom/client";
import Entrenador from "./Entrenador.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Entrenador />
  </React.StrictMode>
);
