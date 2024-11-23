import { useState } from 'react'
import { useLocalStorage } from 'react-use'

export const useSheetFavoriteState = (id: string): [boolean, () => void] => {
  const [storageValue, setStorageValue] = useLocalStorage<string[]>('favorite-sheets', [] as const)
  const [isFavorite, setIsFavorite] = useState(storageValue?.includes(id) ?? false)

  const toggleFavorite = () => {
    if (isFavorite) {
      setStorageValue(storageValue?.filter((item) => item !== id))
    } else {
      setStorageValue([...(storageValue ?? []), id])
    }
    setIsFavorite(!isFavorite)
  }

  return [isFavorite, toggleFavorite]
}
