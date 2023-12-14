import { DXVersion } from "../../../models/context/AppContext";

export interface DXRatingPlugin {
  userPreferenceDidChanged: (
    options: UserPreferenceDidChangedOptions,
  ) => Promise<void>;
}

export interface UserPreferenceDidChangedOptions {
  version: DXVersion;
}
