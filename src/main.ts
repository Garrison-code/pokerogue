import "#app/polyfills"; // All polyfills MUST be loaded first for side effects
import "#init/init-manifest"; // initializes the manifest, must be done *before* i18n is initialized due to being used for caching
import "#app/i18n"; // Initializes i18n on import
import "./ui/type-chart-panel.css";

import { InvertPostFX } from "#app/pipelines/invert";
import { isMobile, preventDoubleTapZoom } from "#app/touch-controls";
import { isBeta, isDev } from "#constants/app-constants";
import { version } from "#package.json";
import { createTypeChartPanel } from "#ui/type-chart-panel";
import Phaser from "phaser";
import BBCodeTextPlugin from "phaser3-rex-plugins/plugins/bbcodetext-plugin";
import InputTextPlugin from "phaser3-rex-plugins/plugins/inputtext-plugin";
import TransitionImagePackPlugin from "phaser3-rex-plugins/templates/transitionimagepack/transitionimagepack-plugin";
import UIPlugin from "phaser3-rex-plugins/templates/ui/ui-plugin";

if (import.meta.env.VITE_APP_TITLE) {
  document.title = import.meta.env.VITE_APP_TITLE;
} else if (isBeta || isDev) {
  document.title += " (Beta)";
}

preventDoubleTapZoom();

async function startGame(): Promise<void> {
  const { initSettingsManager } = await import("#app/global-settings-manager");
  const { initGlobalAudioManager } = await import("#app/global-audio-manager");

  await initSettingsManager();
  const audioManager = await initGlobalAudioManager();

  const LoadingScene = (await import("./loading-scene")).LoadingScene;
  const BattleScene = (await import("./battle-scene")).BattleScene;
  let game: Phaser.Game;
  const typeChart = createTypeChartPanel({
    onToolFocus: () => game?.events.emit("type-chart/focus"),
    onResize: (width, height) => {
      if (game?.isBooted && game.scale.parentSize) {
        game.scale.setParentSize(width, height);
      }
    },
  });
  game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: "app",
    audio: {
      noAudio: !audioManager.isAudioEnabled,
    },
    scale: {
      width: 1920,
      height: 1080,
      mode: Phaser.Scale.FIT,
      fullscreenTarget: document.body,
    },
    plugins: {
      global: [
        {
          key: "rexInputTextPlugin",
          plugin: InputTextPlugin,
          start: true,
        },
        {
          key: "rexBBCodeTextPlugin",
          plugin: BBCodeTextPlugin,
          start: true,
        },
        {
          key: "rexTransitionImagePackPlugin",
          plugin: TransitionImagePackPlugin,
          start: true,
        },
      ],
      scene: [
        {
          key: "rexUI",
          plugin: UIPlugin,
          mapping: "rexUI",
        },
      ],
    },
    input: {
      mouse: {
        target: "app",
      },
      touch: {
        target: "app",
      },
      gamepad: true,
    },
    dom: {
      createContainer: true,
    },
    antialias: false,
    pipeline: [InvertPostFX] as unknown as Phaser.Types.Core.PipelineConfig,
    scene: [LoadingScene, BattleScene],
    version,
  });
  game.events.once(Phaser.Core.Events.READY, typeChart.refresh);
  game.events.once(Phaser.Core.Events.DESTROY, typeChart.destroy);
  game.sound.pauseOnBlur = isMobile();
}

try {
  await Promise.all([document.fonts.load("16px emerald"), document.fonts.load("10px pkmnems")]);
} catch (err) {
  console.error("Error loading fonts:", err);
} finally {
  await startGame();
}
