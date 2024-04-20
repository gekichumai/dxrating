import { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import MdiGestureTap from "~icons/mdi/gesture-tap";
import MdiGestureTapHold from "~icons/mdi/gesture-tap-hold";

const GESTURE_ICON = {
  ["tap"]: MdiGestureTap,
  ["tap-hold"]: MdiGestureTapHold,
};
export const GestureHint: FC<{
  gesture: "tap" | "tap-hold";
  description: ReactNode;
}> = ({ gesture, description }) => {
  const { t } = useTranslation(["global"]);
  const GestureIcon = GESTURE_ICON[gesture];

  return (
    <div className="px-1.5 py-0.5 rounded-full bg-gray-1 text-xs ml-1 inline-flex items-center gap-1 text-zinc-6 select-none">
      <GestureIcon />
      <span className="tracking-[-0.1em]">
        {t("global:gesture-hint." + gesture)}
      </span>
      <div className="bg-gray-3 w-px h-3" />
      <span>{description}</span>
    </div>
  );
};
