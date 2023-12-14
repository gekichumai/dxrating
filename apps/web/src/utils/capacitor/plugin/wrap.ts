import { registerPlugin } from "@capacitor/core";

import type { DXRatingPlugin as DXRatingPluginType } from "./definitions";

const DXRatingPlugin = registerPlugin<DXRatingPluginType>("DXRatingPlugin", {
  web: () => import("./web").then((m) => new m.DXRatingWeb()),
});

export { DXRatingPlugin };
