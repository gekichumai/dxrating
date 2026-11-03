/** Request body limits of the cloud save routes (design §11.4) */
export const CLOUD_SAVE_BODY_LIMIT_BYTES = 1024 * 1024
/** `replace` and `client-imports` carry a whole save */
export const CLOUD_SAVE_LARGE_BODY_LIMIT_BYTES = 2 * 1024 * 1024