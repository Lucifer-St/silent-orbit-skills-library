import type { CSSProperties } from "react";
import type { OrbitSystemNode } from "../../types";
import { getSystemVisual } from "../../lib/cosmosAssets";
import { CosmosAsset } from "../CosmosAsset";
import { useLocale } from "../../i18n/LocaleContext";

interface CelestialSystemProps {
  readonly node: OrbitSystemNode;
  readonly active: boolean;
  readonly onSelect: (node: OrbitSystemNode) => void;
}

export function CelestialSystem({ node, active, onSelect }: CelestialSystemProps) {
  const { category } = useLocale();
  const style = { left: `${node.position.x}%`, top: `${node.position.y}%` } as CSSProperties;
  const visual = getSystemVisual(node.orbitIndex);

  return (
    <button
      className="celestial-system"
      data-active={active}
      data-system-id={node.id}
      style={style}
      type="button"
      aria-pressed={active}
      aria-label={`${category(node.category)}: ${node.skillCount} Skills, ${node.libraryCount} Libraries`}
      onClick={() => onSelect(node)}
    >
      <CosmosAsset className="system-cosmos-asset" src={visual} />
      <span className="orbit-focus-frame" aria-hidden="true" />
      <span className="system-copy">
        <strong>{category(node.category)}</strong>
        <small>{node.skillCount} SKILLS / {node.libraryCount} LIBRARIES</small>
      </span>
    </button>
  );
}
