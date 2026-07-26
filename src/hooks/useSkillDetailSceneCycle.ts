import { useCallback, useRef, useState } from "react";
import {
  defaultSkillDetailScene,
  shuffleSkillDetailScenes,
} from "../lib/skillDetailScenes";
import type { SkillDetailScene } from "../lib/skillDetailScenes";

export function useSkillDetailSceneCycle() {
  const bagRef = useRef<SkillDetailScene[]>([]);
  const previousSceneRef = useRef<SkillDetailScene | null>(defaultSkillDetailScene);

  const drawNextScene = useCallback((): SkillDetailScene => {
    if (bagRef.current.length === 0) {
      bagRef.current = shuffleSkillDetailScenes(previousSceneRef.current);
    }

    const nextScene = bagRef.current.shift() ?? defaultSkillDetailScene;
    previousSceneRef.current = nextScene;
    return nextScene;
  }, []);

  // Keep the hidden initial state outside the bag so the first three visible
  // Skill Detail openings always exhaust one complete three-scene cycle.
  const [scene, setScene] = useState<SkillDetailScene>(defaultSkillDetailScene);
  const advanceScene = useCallback(() => setScene(drawNextScene()), [drawNextScene]);

  return { advanceScene, scene } as const;
}
