import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import "./styles.css";

if (!("Buffer" in globalThis)) {
  Object.assign(globalThis, { Buffer });
}

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

Promise.all([import("./App"), import("./solana")]).then(([appModule, solanaModule]) => {
  const App = appModule.default;
  const { SolanaAppProvider } = solanaModule;

  root.render(
    <React.StrictMode>
      <SolanaAppProvider>
        <App />
      </SolanaAppProvider>
    </React.StrictMode>,
  );
});
