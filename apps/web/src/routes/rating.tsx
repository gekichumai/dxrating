import { createFileRoute } from '@tanstack/react-router'
import { RatingCalculator } from '@/pages/RatingCalculator'

export const Route = createFileRoute('/rating')({
  ssr: false,
  component: RatingCalculator,
})