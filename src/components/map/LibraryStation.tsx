import type { CSSProperties } from "react";
import { StarSkillMarker } from "../badges/StarSkillMarker";
import type { LibraryStationMapNode } from "../../types";

interface LibraryStationProps {
  readonly node: LibraryStationMapNode;
  readonly selected?: boolean;
  readonly focusState?: "default" | "active" | "related" | "muted" | "match";
  readonly onSelect?: (node: LibraryStationMapNode) => void;
}

export function LibraryStation({ node, selected = false, focusState = "default", onSelect }: LibraryStationProps) {
  const accent = node.isPrivateHomeBase ? "var(--gold)" : node.highValueCount > 0 ? "var(--rust)" : "var(--teal)";
  const style = {
    left: `${node.position.x}%`,
    top: `${node.position.y}%`,
    "--station-accent": accent,
  } as CSSProperties;

  return (
    <button
      className={`library-station is-${focusState} ${selected ? "is-selected" : ""} ${node.isPrivateHomeBase ? "is-home-base" : ""}`}
      style={style}
      type="button"
      data-station-id={node.id}
      aria-label={`${node.title}: ${node.category}, ${node.skillCount} skills${node.highValueCount > 0 ? `, ${node.highValueCount} high-value` : ""}`}
      aria-pressed={selected}
      title={`${node.title} / ${node.category}`}
      onClick={() => onSelect?.(node)}
    >
      <span className="station-icon" aria-hidden="true">
        {node.isPrivateHomeBase ? "P" : "S"}
      </span>
      <span className="station-title">{node.title}</span>
      <span className="station-count">{node.skillCount}</span>
      {node.highValueCount > 0 && <StarSkillMarker compact label={`${node.highValueCount} high-value skills`} />}
    </button>
  );
}
