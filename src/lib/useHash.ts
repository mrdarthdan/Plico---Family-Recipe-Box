import { useEffect, useState } from 'react'

/** The part of the URL after "#". The app routes on it so any static host works. */
export function useHash(): string {
  const [hash, setHash] = useState(() => location.hash.slice(1))
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return hash
}

export function go(hash: string) {
  location.hash = hash
}
