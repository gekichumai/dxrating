import clsx from "clsx";
import { FC, ImgHTMLAttributes, useRef, useState } from "react";

export const FadedImage: FC<
  ImgHTMLAttributes<HTMLImageElement> & {
    placeholderClassName?: string;
    draggable?: boolean;
  }
> = ({ placeholderClassName, draggable, ...props }) => {
  const [loaded, setLoaded] = useState(false);
  const [instantlyLoaded, setInstantlyLoaded] = useState(false);
  const firstMountAt = useRef(Date.now());
  const onLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true);
    props.onLoad?.(event);

    if (Date.now() - firstMountAt.current < (1 / 60) * 1000) {
      // 1 frame at 60fps
      setInstantlyLoaded(true);
    }
  };

  return (
    <div className={clsx("relative", props.className, placeholderClassName)}>
      <img
        {...props}
        onLoad={onLoad}
        className={clsx(
          "transition-opacity h-full w-full",
          loaded ? "opacity-100" : "opacity-0",
          !draggable && "select-none",
          instantlyLoaded ? "duration-0" : "duration-200",
        )}
        draggable={draggable}
        style={
          !draggable
            ? {
                WebkitTouchCallout: "none",
              }
            : undefined
        }
      />
    </div>
  );
};
