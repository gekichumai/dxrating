import { WebPlugin } from '@capacitor/core'
import type { DXRatingPlugin, UserPreferenceDidChangedOptions } from './definitions'

export class DXRatingWeb extends WebPlugin implements DXRatingPlugin {
  userPreferenceDidChanged(options: UserPreferenceDidChangedOptions): Promise<void> {
    console.info(
      'DXRatingWeb: userPreferenceDidChanged on web does not have any valid use cases. This call has been ignored.',
      options,
    )
    return Promise.resolve()
  }

  launchInstantOCR(): Promise<void> {
    console.info('DXRatingWeb: launchInstantOCR on web does not have any valid use cases. This call has been ignored.')
    return Promise.resolve()
  }
}
