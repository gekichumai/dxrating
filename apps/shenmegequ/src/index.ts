import { handle } from './redirect'

export default {
  fetch(request: Request): Response {
    return handle(request)
  },
}