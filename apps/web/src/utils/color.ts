import Color from "colorjs.io";
import { match } from "ts-pattern";

export const deriveColor = (color: string, type: "border" | "text") => {
  const c = new Color(color);
  return match(type)
    .with("border", () => {
      c.lch.l -= 5;
      return c.display();
    })
    .with("text", () => {
      if (c.luminance > 0.5) {
        return "black";
      } else {
        return "white";
      }
    })
    .exhaustive();
};
