import {
  Button,
  ButtonBase,
  type ButtonBaseProps,
  type ButtonProps,
  Chip,
  type ChipProps,
  FormControl,
  type FormControlProps,
  Paper,
  type PaperProps,
  Tooltip,
  type TooltipProps,
} from '@mui/material'
import { motion } from 'framer-motion'

export const MotionButtonBase = motion((props: ButtonBaseProps & { ref?: React.Ref<HTMLButtonElement> }) => (
  <ButtonBase {...props} />
))

export const MotionButton = motion((props: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) => (
  <Button {...props} />
))

export const MotionTooltip = motion((props: TooltipProps & { ref?: React.Ref<HTMLDivElement> }) => (
  <Tooltip {...props} />
))

export const MotionChip = motion((props: ChipProps & { ref?: React.Ref<HTMLDivElement> }) => <Chip {...props} />)

export const MotionPaper = motion((props: PaperProps & { ref?: React.Ref<HTMLDivElement> }) => <Paper {...props} />)

export const MotionFormControl = motion((props: FormControlProps & { ref?: React.Ref<HTMLDivElement> }) => (
  <FormControl {...props} />
))