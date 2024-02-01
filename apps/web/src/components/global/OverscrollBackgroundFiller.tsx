import { useWindowScroll } from "react-use";
import { useVersionTheme } from "../../utils/useVersionTheme";

const HEIGHT = 16 * 4;
const DETECT_HEIGHT = 16 * 16;

export const OverscrollBackgroundFiller = () => {
  const scroll = useWindowScroll();
  const versionTheme = useVersionTheme();

  return (
    <div
      className="fixed top-0 left-0 right-0 w-full h-full pointer-events-none"
      style={{
        height: `${scroll.y < DETECT_HEIGHT ? -scroll.y + HEIGHT : 0}px`,
        background: versionTheme.accentColor,
      }}
    />
  );
};
