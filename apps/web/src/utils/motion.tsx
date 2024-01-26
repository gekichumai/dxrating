import {
  ButtonBase,
  ButtonBaseProps,
  Tooltip,
  TooltipProps,
} from "@mui/material";
import { motion } from "framer-motion";
import { ForwardedRef, forwardRef } from "react";

export const MotionButtonBase = motion(
  forwardRef((props: ButtonBaseProps, ref: ForwardedRef<HTMLButtonElement>) => (
    <ButtonBase ref={ref} {...props} />
  )),
);

export const MotionTooltip = motion(
  forwardRef((props: TooltipProps, ref: ForwardedRef<HTMLDivElement>) => (
    <Tooltip ref={ref} {...props} />
  )),
);
