import type { CSSProperties } from "react";

interface CosmosAssetProps {
  readonly className?: string;
  readonly dataArrivalSkill?: string;
  readonly src: string;
  readonly style?: CSSProperties;
}

export function CosmosAsset({ className, dataArrivalSkill, src, style }: CosmosAssetProps) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={className}
      data-arrival-skill={dataArrivalSkill}
      data-cosmos-asset={src}
      draggable={false}
      src={src}
      style={style}
    />
  );
}
