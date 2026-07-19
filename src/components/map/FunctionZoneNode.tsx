import type { CSSProperties } from "react";
import type { FunctionZoneMapNode } from "../../types";

interface FunctionZoneNodeProps {
  readonly node: FunctionZoneMapNode;
  readonly selected?: boolean;
  readonly focusState?: "default" | "active" | "related" | "muted" | "match";
  readonly onSelect?: (category: string) => void;
}

export function FunctionZoneNode({ node, selected = false, focusState = "default", onSelect }: FunctionZoneNodeProps) {
  const style = {
    left: `${node.position.x}%`,
    top: `${node.position.y}%`,
    "--zone-color": node.color,
  } as CSSProperties;

  return (
    <button
      className={`function-zone-node is-${focusState} ${selected ? "is-selected" : ""}`}
      style={style}
      type="button"
      aria-label={`${node.category}: ${node.skillCount} skills, ${node.libraryCount} ability units`}
      aria-pressed={selected}
      title={`${node.category} / ${node.skillCount} skills / ${node.libraryCount} units`}
      onClick={() => onSelect?.(node.category)}
    >
      <span className="zone-node-marker" aria-hidden="true" />
      <span className="zone-node-copy">
        <span className="zone-node-label">{node.category}</span>
        <span className="zone-node-meta">
          {node.skillCount} skills / {node.libraryCount} units
        </span>
      </span>
    </button>
  );
}
