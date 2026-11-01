import { pokerogueApi } from "#api/api";
import { globalScene } from "#app/global-scene";
import { bypassLogin } from "#constants/app-constants";
import { AdminMode } from "#enums/admin-mode";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import { GameData } from "#system/game-data";
import type { AdminUiHandlerService, AdminUiHandlerServiceMode, SearchAccountResponse } from "#types/api";
import type { ModalConfig } from "#types/ui-types";
import type { InputFieldConfig } from "#ui/form-modal-ui-handler";
import { PointerFormModalUiHandler } from "#ui/pointer-form-modal-ui-handler";
import { getTextColor } from "#ui/text";
import { toTitleCase } from "#utils/strings";
import Phaser from "phaser";

export class AdminUiHandler extends PointerFormModalUiHandler {
  private adminMode: AdminMode;
  private adminResult: SearchAccountResponse;
  private config: ModalConfig;

  private tempGameData: GameData | null = null;
  private dataUsername: string | undefined;

  protected override processFormButton(index: number): void {
    if (!this.buttonContainers[index]?.visible) {
      return;
    }
    if (index < 2) {
      super.processFormButton(index);
      return;
    }
    this.invokeFormAction(() => {
      this.config.buttonActions[index]?.();
      // Failed information entry stays available; a hidden modal unlocks on unhide instead.
      if (this.active && this.modalContainer.visible) {
        this.releaseFormInput();
      }
    });
  }

  override unhide(): void {
    super.unhide();
    this.releaseFormInput();
  }

  private readonly buttonGap = 10;
  /** @returns "[field] is required" */
  private static ERR_REQUIRED_FIELD(field: string) {
    if (field === "username") {
      return `${toTitleCase(field)} is required`;
    }
    return `${toTitleCase(field)} Id is required`;
  }
  /** @returns "Username and [service] successfully [mode]ed" */
  private static SUCCESS_SERVICE_MODE(service: string, mode: string) {
    return `Username and ${service} successfully ${mode.toLowerCase()}ed`;
  }

  override getModalTitle(): string {
    return "Admin panel";
  }

  override getWidth(): number {
    return this.adminMode === AdminMode.ADMIN ? 180 : 160;
  }

  override getMargin(): [number, number, number, number] {
    return [0, 0, 0, 0];
  }

  override getButtonLabels(): string[] {
    switch (this.adminMode) {
      case AdminMode.LINK:
        return ["Link Account", "Cancel", "", ""];
      case AdminMode.SEARCH:
        return ["Find account", "Cancel", "", ""];
      case AdminMode.ADMIN:
        return ["Back to search", "Cancel", "Stats", "Pokedex"];
      default:
        return ["Activate ADMIN", "Cancel", "Stats", "Pokedex"];
    }
  }

  override getInputFieldConfigs(): InputFieldConfig[] {
    switch (this.adminMode) {
      case AdminMode.LINK:
        return [{ label: "Username" }, { label: "Discord ID" }];
      case AdminMode.SEARCH:
        return [{ label: "Username" }];
      case AdminMode.ADMIN: {
        // Discord and Google ID fields that are not empty get locked, other fields are all locked
        return [
          { label: "Username", isReadOnly: true },
          {
            label: "Discord ID",
            isReadOnly: (this.adminResult?.discordId ?? "") !== "",
          },
          {
            label: "Google ID",
            isReadOnly: (this.adminResult?.googleId ?? "") !== "",
          },
          { label: "Last played", isReadOnly: true },
          { label: "Registered", isReadOnly: true },
        ];
      }
      default:
        return [];
    }
  }

  show(args: any[]): boolean {
    this.config = args[0] as ModalConfig; // config
    this.adminMode = args[1] as AdminMode; // admin mode
    this.adminResult = args[2] ?? {
      username: "",
      discordId: "",
      googleId: "",
      lastLoggedIn: "",
      registered: "",
    }; // admin result, if any
    const isMessageError = args[3]; // is the message shown a success or error

    const fields = this.getInputFieldConfigs();
    const hasTitle = !!this.getModalTitle();

    this.stopPointerInput();
    this.removeAdminFields();
    if (this.dataUsername !== this.adminResult.username || this.adminMode !== AdminMode.ADMIN) {
      this.tempGameData = null;
    }
    this.updateFields(fields, hasTitle);
    this.updateContainer(this.config);

    const labels = this.getButtonLabels();
    for (let i = 0; i < labels.length; i++) {
      this.buttonLabels[i].setText(labels[i]);
      const width = this.buttonLabels[i].displayWidth + 8;
      this.buttonBgs[i]
        .setSize(width, 16)
        .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, 16), Phaser.Geom.Rectangle.Contains);
    }

    const msgColor = isMessageError ? TextStyle.SUMMARY_PINK : TextStyle.SUMMARY_GREEN;

    this.errorMessage
      .setPosition(10, (hasTitle ? 31 : 5) + 20 * (fields.length - 1) + 16 + this.getButtonTopMargin())
      .setColor(getTextColor(msgColor))
      .setShadowColor(getTextColor(msgColor, true));

    if (!super.show(args)) {
      return false;
    }

    this.hideLastButtons(this.adminMode === AdminMode.ADMIN ? 0 : 2);

    this.populateFields(this.adminMode, this.adminResult);
    this.submitAction = () => {
      const adminResult = this.convertInputsToAdmin();
      const mode = this.adminMode;
      const validFields = this.areFieldsValid(mode);
      void this.submitAdminOperation(adminResult, mode, validFields);
    };
    return true;
  }

  showMessage(message: string, adminResult: SearchAccountResponse, isError: boolean) {
    globalScene.ui.setMode(
      UiMode.ADMIN,
      { ...this.config, errorMessage: String(message ?? "").trim() },
      this.adminMode,
      adminResult,
      isError,
    );
    if (isError) {
      globalScene.ui.playError();
    } else {
      globalScene.ui.playSelect();
    }
  }

  private populateAdminFields(adminResult: SearchAccountResponse): void {
    const keys = ["username", "discordId", "googleId", "lastLoggedIn", "registered"] as const;
    keys.forEach((key, index) => {
      this.inputs[index].setText(adminResult[key] ?? "");
      if (key !== "discordId" && key !== "googleId") {
        return;
      }
      const background = this.inputContainers[index].list.find(
        (object): object is Phaser.GameObjects.NineSlice => object.type === "NineSlice",
      );
      const service: AdminUiHandlerService = key === "discordId" ? "discord" : "google";
      const mode: AdminUiHandlerServiceMode = adminResult[key] ? "Unlink" : "Link";
      const image = globalScene.add.image(
        this.inputContainers[index].x + background!.width + this.buttonGap,
        this.inputContainers[index].y + Math.floor(background!.height / 2),
        mode === "Link" ? "link_icon" : "unlink_icon",
      );
      image
        .setName(`adminBtn_${key}`)
        .setOrigin()
        .setInteractive()
        .on(
          "pointerdown",
          (pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
            event.stopPropagation();
            if (pointer.wasTouch || !this.getUi().canProcessPointerInput(this)) {
              return;
            }
            if (pointer.rightButtonDown()) {
              this.getUi().processInput(Button.CANCEL);
            } else if (pointer.leftButtonDown()) {
              this.invokeFormAction(() => {
                const result = this.convertInputsToAdmin();
                const valid = this.areFieldsValid(this.adminMode, service);
                void this.submitAdminOperation(result, this.adminMode, valid, { service, mode });
              });
            }
          },
        );
      this.addInteractionHoverEffect(image);
      this.modalContainer.add(image);
    });
  }

  private async submitAdminOperation(
    result: SearchAccountResponse,
    mode: AdminMode,
    valid: { error: boolean; errorMessage?: string },
    link?: { service: AdminUiHandlerService; mode: AdminUiHandlerServiceMode },
  ): Promise<void> {
    const current = await this.beginLoadingOperation();
    if (!current()) {
      return;
    }
    if (valid.error) {
      this.showMessage(valid.errorMessage ?? "", result, true);
      return;
    }
    if (mode === AdminMode.ADMIN && !link) {
      this.updateAdminPanelInfo(result, AdminMode.SEARCH);
      return;
    }
    if (mode === AdminMode.LINK || link) {
      const service = link?.service ?? "discord";
      const action = link?.mode ?? "Link";
      const response = await this.adminLinkUnlink(result, service, action);
      if (!current()) {
        return;
      }
      if (response.error) {
        this.showMessage(response.errorType ?? "", result, true);
        return;
      }
      if (!link) {
        this.showMessage(AdminUiHandler.SUCCESS_SERVICE_MODE(service, action), result, false);
        return;
      }
      const refreshed = await this.adminSearch(result, current);
      if (!current()) {
        return;
      }
      this.showMessage(
        refreshed.error ? (refreshed.errorType ?? "") : AdminUiHandler.SUCCESS_SERVICE_MODE(service, action),
        refreshed.adminSearchResult ?? result,
        refreshed.error,
      );
      return;
    }
    const response = await this.adminSearch(result, current);
    if (!current()) {
      return;
    }
    if (response.error) {
      this.showMessage(response.errorType ?? "", result, true);
    } else {
      this.updateAdminPanelInfo(response.adminSearchResult ?? result);
    }
  }

  /**
   * This is used to update the fields' text when loading in a new admin ui handler. It uses the {@linkcode adminResult}
   * to update the input text based on the {@linkcode adminMode}. For a linking adminMode, it sets the username and discord.
   * For a search adminMode, it sets the username. For an admin adminMode, it sets all the info from adminResult in the
   * appropriate text boxes, and also sets the link/unlink icons for discord/google depending on the result
   */
  private populateFields(adminMode: AdminMode, adminResult: SearchAccountResponse) {
    switch (adminMode) {
      case AdminMode.LINK:
        this.inputs[0].setText(adminResult.username);
        this.inputs[1].setText(adminResult.discordId);
        break;
      case AdminMode.SEARCH:
        this.inputs[0].setText(adminResult.username);
        break;
      case AdminMode.ADMIN:
        this.populateAdminFields(adminResult);
        break;
    }
  }

  private areFieldsValid(adminMode: AdminMode, service?: string): { error: boolean; errorMessage?: string } {
    switch (adminMode) {
      case AdminMode.LINK:
        if (!this.inputs[0].text) {
          // username missing from link panel
          return {
            error: true,
            errorMessage: AdminUiHandler.ERR_REQUIRED_FIELD("username"),
          };
        }
        if (!this.inputs[1].text) {
          // discordId missing from linking panel
          return {
            error: true,
            errorMessage: AdminUiHandler.ERR_REQUIRED_FIELD("discord"),
          };
        }
        break;
      case AdminMode.SEARCH:
        if (!this.inputs[0].text && !bypassLogin) {
          // username missing from search panel, skip check for local testing
          return {
            error: true,
            errorMessage: AdminUiHandler.ERR_REQUIRED_FIELD("username"),
          };
        }
        break;
      case AdminMode.ADMIN:
        if (!this.inputs[1].text && service === "discord") {
          // discordId missing from admin panel
          return {
            error: true,
            errorMessage: AdminUiHandler.ERR_REQUIRED_FIELD(service),
          };
        }
        if (!this.inputs[2].text && service === "google") {
          // googleId missing from admin panel
          return {
            error: true,
            errorMessage: AdminUiHandler.ERR_REQUIRED_FIELD(service),
          };
        }
        break;
    }
    return {
      error: false,
    };
  }

  private convertInputsToAdmin(): SearchAccountResponse {
    const inputs = this.inputs;
    return {
      username: inputs[0]?.node ? inputs[0].text : "",
      discordId: inputs[1]?.node ? inputs[1]?.text : "",
      googleId: inputs[2]?.node ? inputs[2]?.text : "",
      lastLoggedIn: inputs[3]?.node ? inputs[3]?.text : "",
      registered: inputs[4]?.node ? inputs[4]?.text : "",
    };
  }

  private async adminSearch(adminSearchResult: SearchAccountResponse, current: () => boolean) {
    this.tempGameData = null;
    this.dataUsername = undefined;
    // Mocking response, solely for local testing
    if (bypassLogin) {
      const fakeResponse: SearchAccountResponse = {
        username: adminSearchResult.username,
        discordId: "",
        googleId: "",
        lastLoggedIn: "",
        registered: "",
      };
      if (current()) {
        this.tempGameData = globalScene.gameData;
        this.dataUsername = adminSearchResult.username;
      }
      return { adminSearchResult: fakeResponse, error: false };
    }

    try {
      const [adminInfo, errorType] = await pokerogueApi.admin.searchAccount({
        username: adminSearchResult.username,
      });
      if (errorType || !adminInfo) {
        // error - if adminInfo.status === this.httpUserNotFoundErrorCode that means the username can't be found in the db
        return { adminSearchResult, error: true, errorType };
      }
      if (current() && adminInfo.systemData) {
        const rawSystem = JSON.stringify(adminInfo.systemData);
        try {
          this.tempGameData = GameData.fromRawSystem(rawSystem);
          this.dataUsername = adminInfo.username;
        } catch {
          console.warn("Could not parse system data for admin panel, stats/pokedex will be unavailable!");
        }
      }
      return { adminSearchResult: adminInfo, error: false };
    } catch (err) {
      console.error(err);
      return { error: true, errorType: String(err) };
    }
  }

  private async adminLinkUnlink(
    adminSearchResult: SearchAccountResponse,
    service: AdminUiHandlerService,
    mode: AdminUiHandlerServiceMode,
  ) {
    try {
      const error = await pokerogueApi.admin.linkUnlinkRequest(mode, service, adminSearchResult);
      if (error != null) {
        return { error: true, errorType: error };
      }
    } catch (err) {
      console.error(err);
      return { error: true, errorType: String(err) };
    }
    return { adminSearchResult, error: false };
  }

  private updateAdminPanelInfo(adminSearchResult: SearchAccountResponse, mode?: AdminMode) {
    mode = mode ?? AdminMode.ADMIN;
    globalScene.ui.setMode(
      UiMode.ADMIN,
      {
        buttonActions: [
          // we double revert here and below to go back 2 layers of menus
          () => {
            globalScene.ui.revertMode();
            globalScene.ui.revertMode();
          },
          () => {
            globalScene.ui.revertMode();
            globalScene.ui.revertMode();
          },
          () => {
            if (this.tempGameData == null) {
              globalScene.ui.playError();
              return;
            }
            this.hide();
            globalScene.ui.setOverlayMode(
              UiMode.GAME_STATS,
              adminSearchResult.username,
              this.tempGameData,
              this.unhide.bind(this),
            );
          },
          () => {
            if (this.tempGameData == null) {
              globalScene.ui.playError();
              return;
            }
            this.hide();
            globalScene.ui.setOverlayMode(UiMode.POKEDEX, this.tempGameData, this.unhide.bind(this));
          },
        ],
      },
      mode,
      adminSearchResult,
    );
  }

  override clear(): void {
    super.clear();
    this.removeAdminFields();
  }

  private removeAdminFields(): void {
    const fields = [
      ...this.inputContainers,
      ...this.formLabels,
      ...this.modalContainer.list.filter(object => object.name?.startsWith("adminBtn_")),
    ];
    for (const field of fields) {
      this.modalContainer.remove(field, true);
    }
    this.inputs = [];
    this.inputContainers = [];
    this.formLabels = [];
  }
}
