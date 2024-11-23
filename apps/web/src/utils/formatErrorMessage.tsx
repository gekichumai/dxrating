export function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (Object.prototype.hasOwnProperty.call(error, 'message')) {
    return (error as { message: unknown }).message
  }
  return 'An error occurred'
}
