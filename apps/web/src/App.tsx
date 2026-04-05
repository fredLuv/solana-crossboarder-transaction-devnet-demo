import React, { useEffect, useMemo, useState } from "react";
import { BlinkDemo } from "./routes/BlinkDemo";
import { Landing } from "./routes/Landing";
import TransactionDemo from "./routes/TransactionDemo";

type AppPath = "/" | "/transaction" | "/blink";

function normalizePath(pathname: string): AppPath {
  if (pathname === "/transaction") return "/transaction";
  if (pathname === "/blink") return "/blink";
  return "/";
}

function navigate(nextPath: AppPath) {
  if (window.location.pathname === nextPath) return;
  window.history.pushState({}, "", nextPath);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [path, setPath] = useState<AppPath>(() =>
    typeof window === "undefined" ? "/" : normalizePath(window.location.pathname)
  );

  useEffect(() => {
    function onPopState() {
      setPath(normalizePath(window.location.pathname));
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title =
      path === "/"
        ? "Solana-CrossBorder-Transaction-Devnet-Demo"
        : path === "/transaction"
          ? "Transaction Demo · Solana-CrossBorder-Transaction-Devnet-Demo"
          : "Blink Demo · Solana-CrossBorder-Transaction-Devnet-Demo";
  }, [path]);

  const navItems = useMemo(
    () => [
      { path: "/" as const, label: "Home" },
      { path: "/transaction" as const, label: "Transaction demo" },
      { path: "/blink" as const, label: "B2B payment (Blink)" }
    ],
    []
  );

  return (
    <>
      <nav className="topNav">
        <button className="brandMark" onClick={() => navigate("/")} type="button">
          Solana-CrossBorder-Transaction-Devnet-Demo
        </button>
        <div className="topNavLinks">
          {navItems.map((item) => (
            <button
              key={item.path}
              className={`topNavLink ${path === item.path ? "active" : ""}`}
              onClick={() => navigate(item.path)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {path === "/" ? <Landing onNavigate={navigate} /> : null}
      {path === "/transaction" ? <TransactionDemo onNavigate={navigate} /> : null}
      {path === "/blink" ? <BlinkDemo onNavigate={navigate} /> : null}
    </>
  );
}
