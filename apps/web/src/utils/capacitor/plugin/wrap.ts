import { registerPlugin } from "@capacitor/core";

import type { DXRatingPlugin as DXRatingPluginType } from "./definitions";

import { DXRatingWeb } from "./web";

const DXRatingPlugin = registerPlugin<DXRatingPluginType>("DXRatingPlugin", {
  web: new DXRatingWeb(),
});

export { DXRatingPlugin };
