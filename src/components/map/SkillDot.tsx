import type { CSSProperties } from "react";
import { StarSkillMarker } from "../badges/StarSkillMarker";
import type { SkillDotMapNode } from "../../types";

interface SkillDotProps {
  readonly node: SkillDotMapNode;
  readonly visible?: boolean;
  readonly selected?: boolean;
  readonly matched?: boolean;
  readonly muted?: boolean;
  readonly onSelect?: (skillName: string) => void;
}

export function SkillDot({ node, visible = true, selected = false, matched = false, muted = false, onSelect }: SkillDotProps) {
  if (!visible) return null;

  const style = {
    left: `${node.position.x}%`,
    top: `${node.position.y}%`,
  } as CSSProperties;

  return (
    <button
      className={`skill-dot ${selected ? "is-selected" : ""} ${matched ? "is-match" : ""} ${muted ? "is-muted" : ""} ${node.isHighValue ? "is-high-value" : ""}`}
      style={style}
      type="button"
      aria-label={`${node.name}${node.isHighValue ? ", high-value skill" : ""}`}
      aria-pressed={selected}
      title={node.name}
      onClick={() => onSelect?.(node.name)}
    >
      <span className="skill-dot-core" aria-hidden="true" />
      <span className="skill-dot-label">{node.name}</span>
      {node.isHighValue && <StarSkillMarker compact label="High-value skill" />}
    </button>
  );
}
