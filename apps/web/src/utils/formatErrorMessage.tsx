export function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "An error occurred";
}
