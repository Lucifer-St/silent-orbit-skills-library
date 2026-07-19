import type { ReactNode } from "react";
import type { PageKey } from "../../types";

export interface AgentConsoleShellProps {
  page: PageKey;
  onHome: () => void;
  nav: ReactNode;
  rail?: ReactNode;
  commandDeck?: ReactNode;
  children: ReactNode;
}

export function AgentConsoleShell(props: AgentConsoleShellProps) {
  const isLibrarianHome = props.page === "librarian";
  return (
    <div className={`agent-console ${isLibrarianHome ? "is-librarian-home" : ""}`} data-surface="console">
      <header className="console-topbar">
        <button className="console-brand" type="button" onClick={props.onHome}>
          SKILLS LIBRARY
        </button>
        {props.nav}
      </header>
      {isLibrarianHome ? (
        <div className="librarian-workspace">{props.children}</div>
      ) : (
        <div className={`console-layout ${props.rail ? "has-function-rail" : "without-function-rail"}`}>
          {props.rail}
          <main className="console-workspace">
            {props.commandDeck}
            {props.children}
          </main>
        </div>
      )}
    </div>
  );
}
