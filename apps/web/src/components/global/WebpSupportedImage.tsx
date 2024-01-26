import { ImgHTMLAttributes } from "react";

export const WebpSupportedImage = ({
  src,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) => {
  const webpSrc = src?.replace(".png", ".webp");
  return (
    <picture>
      <source type="image/webp" srcSet={webpSrc} />
      <source type="image/png" srcSet={src} />
      <img src={src} {...rest} />
    </picture>
  );
};
