import { lazy } from "react";

export const DevTool = lazy(() =>
  import("@hookform/devtools").then((module) => ({ default: module.DevTool })),
);
