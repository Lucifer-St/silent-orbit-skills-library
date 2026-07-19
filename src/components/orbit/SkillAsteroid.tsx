import type { CSSProperties } from "react";
import type { MapPoint, OrbitSkillNode } from "../../types";
import { getSkillVisual } from "../../lib/cosmosAssets";
import { CosmosAsset } from "../CosmosAsset";

interface SkillAsteroidProps {
  readonly node: OrbitSkillNode;
  readonly desktopPosition: MapPoint;
  readonly mobilePosition: MapPoint;
  readonly onSelect: (node: OrbitSkillNode) => void;
}

export function SkillAsteroid({ node, desktopPosition, mobilePosition, onSelect }: SkillAsteroidProps) {
  const visual = getSkillVisual(`${node.stationId}:${node.id}`);
  const style = {
    left: `${desktopPosition.x}%`,
    top: `${desktopPosition.y}%`,
    "--mobile-skill-left": `${mobilePosition.x}%`,
    "--mobile-skill-top": `${mobilePosition.y}%`,
  } as CSSProperties;

  return (
    <button
      className="skill-asteroid"
      data-skill-id={node.id}
      data-station-id={node.stationId}
      style={style}
      type="button"
      aria-label={node.name}
      onClick={() => onSelect(node)}
    >
      <CosmosAsset className="skill-cosmos-asset" src={visual} />
      <span className="orbit-focus-frame" aria-hidden="true" />
      <span className="asteroid-label">{node.name}</span>
    </button>
  );
}
