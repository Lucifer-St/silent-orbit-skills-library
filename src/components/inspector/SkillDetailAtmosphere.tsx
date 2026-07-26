import { CosmosAsset } from "../CosmosAsset";
import {
  getSkillDetailSceneDefinition,
  type SkillDetailScene,
} from "../../lib/skillDetailScenes";

const cosmosRoot = "/assets/cosmos";

const assets = {
  beacon: `${cosmosRoot}/signals/06-beacon-star.png`,
  comet: `${cosmosRoot}/celestial/09-comet.png`,
  parallaxCluster: `${cosmosRoot}/signals/12-parallax-cluster.png`,
} as const;

export function getSkillDetailSceneSeal(scene: SkillDetailScene): string {
  return getSkillDetailSceneDefinition(scene).seal;
}

export function SkillDetailAtmosphere({
  scene,
  skillName,
}: {
  readonly scene: SkillDetailScene;
  readonly skillName: string;
}) {
  const definition = getSkillDetailSceneDefinition(scene);

  return (
    <div
      aria-hidden="true"
      className="skill-detail-atmosphere"
      data-arrival-skill={skillName}
      data-detail-layout={definition.layout}
      data-detail-scene={scene}
      key={`${skillName}:${scene}`}
    >
      <div className="detail-environment-stage">
        <CosmosAsset className="detail-environment" src={definition.environment} />
        <CosmosAsset
          className="detail-celestial detail-parallax-cluster"
          src={assets.parallaxCluster}
        />
        <Beacon index={1} />
        <Beacon index={2} />
        <Beacon index={3} />
        <CosmosAsset className="detail-celestial detail-comet" src={assets.comet} />
      </div>
    </div>
  );
}

function Beacon({ index }: { readonly index: 1 | 2 | 3 }) {
  return <CosmosAsset className={`detail-celestial detail-beacon detail-beacon-${index}`} src={assets.beacon} />;
}
