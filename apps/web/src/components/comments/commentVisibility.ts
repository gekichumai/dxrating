import { useSyncExternalStore } from 'react'

type Visibility = { comments: ReadonlySet<number>; authors: ReadonlySet<string> }
const empty: Visibility = { comments: new Set(), authors: new Set() }
const byViewer = new Map<string, Visibility>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const operations = new Map<string, Map<symbol, { commentId: number; authorId?: string }>>()
export function hideComment(viewer: string, commentId: number, authorId?: string) {
  const token = Symbol()
  const viewerOperations = operations.get(viewer) ?? new Map()
  operations.set(viewer, viewerOperations)
  const update = () => {
    const comments = new Set<number>()
    const authors = new Set<string>()
    for (const operation of viewerOperations.values()) {
      if (operation.authorId) authors.add(operation.authorId)
      else comments.add(operation.commentId)
    }
    byViewer.set(viewer, { comments, authors })
    listeners.forEach((listener) => listener())
  }
  viewerOperations.set(token, { commentId, authorId })
  update()
  return () => {
    viewerOperations.delete(token)
    update()
  }
}

export function filterComments<T extends { id: number; author_id: string }>(comments: T[], visibility: Visibility) {
  return comments.filter(
    (comment) => !visibility.comments.has(comment.id) && !visibility.authors.has(comment.author_id),
  )
}

export function useCommentVisibility(viewer?: string) {
  return useSyncExternalStore(
    subscribe,
    () => (viewer ? (byViewer.get(viewer) ?? empty) : empty),
    () => empty,
  )
}