import useSWR from 'swr'
import { supabase } from './supabase'

export const useServerAliases = () => {
  return useSWR(
    'supabase::sheet-aliases',
    async () => {
      const aliases = await supabase.from('song_aliases').select('song_id, name')
      if (aliases.error) {
        throw aliases.error
      }
      return aliases.data
    },
    {
      focusThrottleInterval: 1000 * 60 * 60,
    }
  )
}
