/** The states the maimai NET fetch reports, in order, and how far along each one is */
export type FetchNetRecordProgressState =
  | 'ready'
  | 'auth:in-progress'
  | 'auth:succeeded'
  | 'fetch:recent:in-progress'
  | 'fetch:recent:completed'
  | 'fetch:music:in-progress:basic'
  | 'fetch:music:in-progress:advanced'
  | 'fetch:music:in-progress:expert'
  | 'fetch:music:in-progress:master'
  | 'fetch:music:in-progress:remaster'
  | 'fetch:music:in-progress:utage'
  | 'fetch:music:completed'
  | 'concluded'

export const FETCH_STATE_PROGRESS: Record<FetchNetRecordProgressState, number> = {
  ready: 0.01,
  'auth:in-progress': 0.08,
  'auth:succeeded': 0.2,
  'fetch:recent:in-progress': 0.2,
  'fetch:recent:completed': 0.3,
  'fetch:music:in-progress:basic': 0.4,
  'fetch:music:in-progress:advanced': 0.5,
  'fetch:music:in-progress:expert': 0.6,
  'fetch:music:in-progress:master': 0.7,
  'fetch:music:in-progress:remaster': 0.8,
  'fetch:music:in-progress:utage': 0.9,
  'fetch:music:completed': 1,
  concluded: 1,
}

export function isFetchNetRecordProgressState(state: string): state is FetchNetRecordProgressState {
  return Object.hasOwn(FETCH_STATE_PROGRESS, state)
}