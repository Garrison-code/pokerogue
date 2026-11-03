## Problem

招式打到替身娃娃時，遊戲會卡住：畫面停在「某寶可夢使出了某招式」的對話框，沒有動畫，也無法點擊，只剩背景音樂在播放。玩家只能重新整理頁面，這場戰鬥的進度也無法繼續。

玩家回報的情境是雙打、對方另一隻已倒下、我方用熱風攻擊有替身的投擲猴。調查後發現，這和投擲猴、接球手、隊友倒下或熱風都無關：單打用撞擊打卡比獸的替身、敵方攻擊我方的替身，都會拋出同一個錯誤；同樣的熱風情境若沒有替身就不會拋錯。

已驗證與未驗證的部分：

- 已驗證（測試）：把測試 mock 的 setter 換成 Phaser 的實際行為後，上述情境在 `MoveEffectPhase` 中、造成傷害前，拋出 `Cannot set properties of undefined (setting 'tone')`。
- 已驗證（讀程式碼）：動畫逐格流程也會對替身娃娃的暫時複製 sprite 做同樣的寫入。
- 推論（尚未在瀏覽器確認）：`requestAnimationFrame` 的 callback 拋錯後，Phaser 的遊戲主迴圈不再排程下一格，因此畫面和輸入停止，而 WebAudio 的音樂繼續播放。

## Root Cause

替身娃娃是由 `BattleScene.addFieldSprite` 建立的，只有 `fieldSpriteSubmitter` 這個 render node 的資料。`BattleAnim.play` 卻在兩個地方對它寫入 `spriteSubmitter` 的 `tone`：

- 動畫結束時的清理函式 `cleanUpAndComplete`（關閉招式動畫時也會直接走這裡）。
- 逐格處理的 `onRepeat`，對象是替身娃娃的暫時複製 sprite。

Phaser 4 的 `setRenderNodeData` 不會先建立缺少的資料，直接對 `undefined` 賦值而拋錯。問題來自 upstream 的 `11794c5f4369`（Update Phaser to v4, #7738），並非 fork 自身的改動。

現有測試抓不到，因為 `MockSprite.setRenderNodeData` 會用 `??=` 自動補上缺少的資料，而且測試預設關閉招式動畫。

## Proposed Solution

- 在 `BattleAnim.play` 中，不再對替身娃娃及其暫時複製 sprite 寫入 `spriteSubmitter` 的資料。寶可夢本體 sprite 的行為不變。
- 讓 `MockSprite.setRenderNodeData` 的行為與 Phaser 一致：render node 資料不存在時同樣拋錯，往後這類問題才測得出來。
- 加入回歸測試，涵蓋動畫關閉與開啟兩條路徑。

## Non-Goals (optional)

見 `design.md` 的 Goals/Non-Goals。

## Success Criteria

- 招式打到替身時不再拋錯，戰鬥繼續進行：替身承受傷害，或被打破並移除。動畫開關不影響這個結果。
- 新增的回歸測試在修正前失敗、修正後通過。
- 在真實瀏覽器中，攻擊有替身的目標不會卡住，Console 也沒有上述 TypeError。
- `pnpm test` 和所有 `typecheck*` script 通過。

## Impact

- Affected specs: 新增 `substitute-move-animation`
- Affected code:
  - Modified: `src/data/battle-anims.ts`, `test/mocks/mocks-container/mock-sprite.ts`, `test/tests/moves/substitute.test.ts`
  - New: `docs/spectra/specs/substitute-move-animation/spec.md`（封存時由 delta spec 產生）
  - Removed: 無
