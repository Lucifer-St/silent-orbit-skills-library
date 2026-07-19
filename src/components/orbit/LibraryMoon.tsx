import type { CSSProperties } from "react";
import type { MapPoint, OrbitLibraryNode } from "../../types";
import { getLibraryVisual } from "../../lib/cosmosAssets";
import { CosmosAsset } from "../CosmosAsset";
import { useLocale } from "../../i18n/LocaleContext";

interface LibraryMoonProps {
  readonly node: OrbitLibraryNode;
  readonly desktopPosition?: MapPoint;
  readonly active: boolean;
  readonly onSelect: (node: OrbitLibraryNode) => void;
}

export function LibraryMoon({ node, desktopPosition = node.position, active, onSelect }: LibraryMoonProps) {
  const { isEnglish } = useLocale();
  const title = isEnglish && node.title === "个人常用" ? "Personal Deck" : node.title;
  const visual = getLibraryVisual(node.id);
  const style = {
    left: `${desktopPosition.x}%`,
    top: `${desktopPosition.y}%`,
    "--mobile-library-left": `${node.position.x}%`,
    "--mobile-library-top": `${node.position.y}%`,
  } as CSSProperties;

  return (
    <button
      className="library-moon"
      data-station-id={node.id}
      data-system-id={node.systemId}
      style={style}
      type="button"
      aria-pressed={active}
      aria-label={`${title}: ${node.skillCount} Skills`}
      onClick={() => onSelect(node)}
    >
      <CosmosAsset className="library-cosmos-asset" src={visual} />
      <span className="orbit-focus-frame" aria-hidden="true" />
      <span className="moon-copy">
        <strong>{title}</strong>
        <small>{node.skillCount} SKILLS</small>
      </span>
    </button>
  );
}
