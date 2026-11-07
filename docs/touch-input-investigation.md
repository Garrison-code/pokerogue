# 觸控輸入調查報告(mouse 功能分支)

- 調查日期:2026-11-05
- 範圍:`beta` 分支(HEAD `cd36260ede30`)相對 `upstream/beta`(merge-base `7c0881255af5`)中,所有與「觸控 / 指標輸入」有關的變更
- 方法:靜態比對 fork 與 `git show upstream/beta:<file>` 的指標處理器;未在實機(iPhone / Android)驗證,「實機未驗證」處都會註明
- 相關記憶:`mouse-branch-audit-progress`、`issue-touch-dropped-*`、`issue-tests-assert-blocks-touch`、`issue-pointer-fade-active-possible-stuck`

## 1. 一句話結論

mouse 功能把「滑鼠 / 觸控」做成兩條路徑:**滑鼠點擊走 Phaser 指標事件,觸控一律走螢幕 D-pad/A/B 虛擬按鍵**(`pointer.wasTouch` → 直接 return)。
這個假設對「選單類」畫面成立,對「文字表單」不成立,因為虛擬按鍵只有 `ACTION/CANCEL`,沒有 `SUBMIT`,也不能打字。
upstream 原本就有 tap 處理的地方,是這個分支把觸控擋掉造成回歸的地方;upstream 本來就沒有 tap 的地方,則不是回歸,只是「觸控沒有新功能」。

## 2. 觸控回歸清單(upstream 能 tap,fork 擋掉)

upstream 在 `src` 內只有以下幾處對 `pointerdown` 做動作(其餘都是 tooltip 用的 `pointerover/out`):

| upstream 位置 | 作用 | fork 現況 | 狀態 |
|---|---|---|---|
| `form-modal-ui-handler` 的 `buttonBgs` | 表單送出 / 取消 | 被 `PointerFormModalUiHandler.createPointerTargets()` 取代,`wasTouch` 且未 opt-in 則 return | 登入家族已修(`b342f2e38690`);**其餘仍壞** |
| `modal-ui-handler` 的 `buttonBgs` | 一般 modal 按鈕 | 檔案無差異,未改動 | 正常 |
| `login-register-info-container` 三個圖示 | 帳號列表 / 下載存檔 / 語言 | `pointerdown` 無 `wasTouch` 判斷 | 正常 |
| `oauth-providers` Discord / Google 圖示 | OAuth 登入 | 僅多 4 行,無觸控判斷 | 正常 |
| `admin-ui-handler` 按鈕 | 管理介面 | `admin-ui-handler.ts:207` 加了 `wasTouch` 判斷 | **回歸**(僅管理員,影響低) |

### 2.1 仍然壞掉的表單(`touchButtonsEnabled` 預設 false)

`pointer-form-modal-ui-handler.ts:81`:`pointer.wasTouch && !this.touchButtonsEnabled` → 直接 return。目前只有 `LoginRegisterInfoContainerUiHandler` 覆寫為 true。

| 表單 | 觸控入口 | 影響 |
|---|---|---|
| 寶可夢改名 `rename-form`(隊伍、起始選擇) | `party-ui-handler.ts:645`、`starter-select-ui-handler.ts:2228` | 點「確認 / 取消」無反應 |
| 存檔改名 `rename-run` | `save-slot-select-ui-handler.ts:145` | 同上 |
| 圖鑑搜尋 / 掃描 `pokedex-scan` | `filter-text.ts:159` | 同上 |
| 修改密碼 `change-password-form` | `menu-ui-handler.ts:406` | 同上;且它直接繼承 `PointerFormModalUiHandler`,不在登入家族的 opt-in 範圍 |
| 測試對話 `test-dialogue` | `menu-ui-handler.ts:462` | 開發 / 除錯用,影響低 |
| 管理介面 `admin` | `menu-ui-handler.ts:546` | 僅管理員 |

**可能的繞道(程式碼推論,實機未驗證)**:表單的 DOM `keydown` 監聽沒有觸控限制(`pointer-form-modal-ui-handler.ts` 內 `listen("keydown")`),軟鍵盤的 Enter / Go 理論上可送出;`CANCEL` 虛擬按鍵可關閉。所以改名類多半是「按鈕點不到、但鍵盤 Enter 可能可用」,嚴重度低於當初的登入問題。這一點需要實機確認,不能當作已解決。

### 2.2 另一個觸控相關缺口:DOM 輸入框的 `pointerdown`

`pointer-form-modal-ui-handler.ts` 的 input `pointerdown` 監聽:`event.pointerType !== "mouse"` 時 return(但已先呼叫 `stopPropagation()`)。觸控時不 `preventDefault`,所以原生聚焦仍可運作,看起來沒問題;但它也意味著觸控完全不會走 `canEditInputs()` 的保護。實機上是否出現「淡出動畫期間可輸入」尚未驗證。

## 3. 「不是回歸」但值得記錄的觸控缺口

以下 `wasTouch` 擋觸控處,upstream 檔案裡**沒有任何 `pointerdown`**,所以觸控本來就靠 D-pad/A/B,並非回歸:

`starter-select`(249、349)、`save-slot-select`(567、594)、`challenges-select`(666、837)、`base-option-select`(469、499、515)、`summary`(663、676)、`pokedex-page`(356)、`mystery-encounter`(77)、`egg-hatch-scene`(31)、`alert-modal`(166)、`tab-menu`(129)、`message-pointer-controller`(66)、`ui-pointer-targets`(46、61)。

結論:這些是設計決定(觸控 = 虛擬按鍵),不需要為了「修回歸」而改。若之後想讓觸控也能直接點選,那是新功能,需另開需求。

### 3.1 `MenuButton`(新檔,fork 專有)—— 觸控裝置上的「幽靈按鈕」

- `ui.ts:229` 無條件建立 `MenuButton`;`menu-button.ts:22` 在 `wasTouch` 時 return,點了沒反應。
- 它的 `available()` 只看 `canOpenMenu()` 與 `canProcessPointerInput`,**不看 `hasTouchscreen()` 或輸入方式**。
- 可見時會呼叫 `reserveMenuButtonSpace(true)`,把 `biomeWaveText / moneyText / scoreText / luckText / enemyModifierBar` 左移 24px(`battle-scene.ts:2261`)。
- 後果(程式推論,實機未驗證):觸控裝置右上角出現一個點了沒用的選單鈕,而且 HUD 為它讓位。觸控本來就有 `apadMenu`(`index.html:115`,`data-key="MENU"`)。
- 建議方向:觸控模式下(`globalScene.inputMethod === "touch"` 或 `hasTouchscreen()` 且已啟用虛擬按鍵)不顯示、也不預留空間;或讓它在觸控時直接觸發 `buttonMenu()`。後者最簡單,且與「觸控表單要能 tap」的方向一致。

## 4. 輸入層與基礎設施變更(觸控相關)

| 變更 | 檔案 | 風險評估 |
|---|---|---|
| `gameplayInputSuspended` 計數器、`suspendGameplayInput()` | `inputs-controller.ts`;使用者:`game-data.ts:1339`(合併存檔對話框)、`touch-controls.ts:119/157`、`ui-inputs.ts:56/73` | 計數必須成對釋放。目前唯一呼叫者是 `mergeImportData`,以 `restoreInput` 回呼釋放(內含 `released` 防重複)。已讀 `game-data.ts:1339-1485`:對話框 `onClose` 與外層 `catch` 都會呼叫 `restoreInput()`(且回呼本身防重複),沒有發現漏釋放路徑;低風險。唯一前提是對話框一定會觸發 `onClose` |
| 虛擬按鍵在 suspend 時直接忽略 | `touch-controls.ts` | 與上同一個風險點 |
| `preventDoubleTapZoom` 對 `[data-game-tool], #system-merge-dialog` 放行 | `touch-controls.ts:225` | 合理;避免 HTML 工具按鈕被吞 |
| `MoveTouchControlsHandler` 改用容器 bounds + `ResizeObserver` | `move-touch-controls-handler.ts` | 修正版面計算;`setPosition` 的 `Math.max(min, max)` 防止負範圍。未見問題 |
| `index.html` / `index.css` | — | **相對 upstream 無差異**(已確認),觸控面板的 HTML/CSS 沒被動過 |

## 5. 與觸控相關的共用機制疑慮

### 5.1 `pointerFadeActive` 可能卡住 —— 本次複查後降級

`ui.ts:556/580/589`。複查 `fadeOut` / `fadeIn` / `cancelMessageFade`:

- `fadeOut` 設 true;`fadeIn` 在 `overlayActive` 為 true 時設 true 並於 tween `onComplete`(且 `fadeId` 吻合)清除;`cancelMessageFade` 同步清除。
- 唯一會漏清的是「fadeIn 的 tween 被外部殺掉」或「fadeIn 進行中又被 fadeOut 搶走 `fadeId`,而之後沒有再 fadeIn」。第二種情況下 upstream 的 `overlayActive` 同樣會停在 true(鍵盤也會死),所以不是 fork 獨有的新風險。
- 仍沒有找到具體觸發路徑。**維持低風險、未證實**;症狀會是「鍵盤可用、滑鼠 / 觸控全死」,遇到時先看 `ui.pointerFadeActive`。

### 5.2 `setModeInternal` 把 `UiMode.MESSAGE` 推進 mode chain —— 未驗證

`212ae0373bdb` 移除了 `this._mode &&`,而 `UiMode.MESSAGE === 0`。影響所有畫面(包含觸控),不限於指標。見 `issue-ui-mode-chain-pushes-message-mode`。需要寫測試在 `upstream/beta` 與本分支各跑一次才能定案。

### 5.3 測試把「觸控被擋」寫成預期行為

`test/tests/ui/` 有 45 個 `*-pointer.test.ts`;共 44 個測試檔含 `wasTouch`、47 處 `wasTouch = true`。其中多數斷言「觸控不會觸發」。這正是登入問題「測試全綠、實機壞掉」的原因。每次修一個觸控表單,必須同一個 commit 把對應「blocks touch」測試改成正向測試。

## 6. 建議的處理順序

1. **改名等表單**(影響:一般玩家,可達路徑多):把 `touchButtonsEnabled` 預設改為 `true`(`PointerFormModalUiHandler` 本體),並移除 `LoginRegisterInfoContainerUiHandler` 的覆寫;同步翻轉 `rename-pointer`、`rename-run-pointer`、`pokedex-scan-pointer`、`change-password-pointer`、`test-dialogue-pointer`、`admin-pointer` 的 touch 測試。`admin-ui-handler.ts:207` 一併處理。
2. **MenuButton**:觸控模式下不顯示、不預留 HUD 空間(或觸控時可點)。
3. ~~`gameplayInputSuspended`~~:已複查,釋放路徑完整,不需處理。
4. **`MESSAGE` 進 mode chain**:寫對照測試,決定是否還原 `this._mode &&`。
5. **實機驗證**:至少 iPhone Safari 一台,走登入 → 改名 → 修改密碼 → 選單 → 合併存檔對話框。目前所有結論都只來自單元測試與程式碼閱讀。

以上 1~2 會動到使用者可見行為與多個測試檔,尚未開工;**動手前需要使用者決定要不要一次擴大修**(見記憶 `issue-touch-dropped-other-pointer-forms`:使用者尚未決定)。

## 7. 本次調查未涵蓋(沿用審計進度清單)

`message-ui-handler.ts`(畫布全域推進訊息,+326 行,僅確認其指標邏輯集中在 `message-pointer-controller`,觸控被擋)、`tutorial.ts`(重寫 386 行)、`base-control-settings-ui-handler.ts`、`egg-gacha-ui-handler.ts`、`party-ui-handler.ts`、`modifier-select-ui-handler.ts`、非 mouse 變更(`system-data-merge.ts`、`system-merge-dialog.ts`、`type-chart-panel.ts`、`pokemon-species.ts`、`game-data.ts` 其餘部分),以及完整 `vitest run` 的基準失敗清單。
