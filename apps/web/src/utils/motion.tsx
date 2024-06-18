import {
  Button,
  ButtonBase,
  ButtonBaseProps,
  ButtonProps,
  Chip,
  ChipProps,
  FormControl,
  FormControlProps,
  Paper,
  PaperProps,
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

export const MotionButton = motion(
  forwardRef((props: ButtonProps, ref: ForwardedRef<HTMLButtonElement>) => (
    <Button ref={ref} {...props} />
  )),
);

export const MotionTooltip = motion(
  forwardRef((props: TooltipProps, ref: ForwardedRef<HTMLDivElement>) => (
    <Tooltip ref={ref} {...props} />
  )),
);

export const MotionChip = motion(
  forwardRef((props: ChipProps, ref: ForwardedRef<HTMLDivElement>) => (
    <Chip ref={ref} {...props} />
  )),
);

export const MotionPaper = motion(
  forwardRef((props: PaperProps, ref: ForwardedRef<HTMLDivElement>) => (
    <Paper ref={ref} {...props} />
  )),
);

export const MotionFormControl = motion(
  forwardRef((props: FormControlProps, ref: ForwardedRef<HTMLDivElement>) => (
    <FormControl ref={ref} {...props} />
  )),
);
