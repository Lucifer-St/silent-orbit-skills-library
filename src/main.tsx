import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { LocaleProvider } from "./i18n/LocaleContext";
import "./styles/fonts.css";
import "./styles.css";
import "./styles/one-bit.css";
import "./styles/console.css";
import "./styles/orbit.css";
import "./styles/librarian.css";
import "./styles/history.css";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </React.StrictMode>,
);
