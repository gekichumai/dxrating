export class ByteCache<T> {
  private entries = new Map<string, { value: T; bytes: number; expiresAt: number }>()
  private bytes = 0

  constructor(
    private readonly maxBytes: number,
    private readonly ttlMs = Infinity,
    private readonly now = Date.now,
    private readonly maxEntries = 256,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.remove(key)
    if (entry.expiresAt <= this.now()) return undefined
    this.entries.set(key, entry)
    this.bytes += entry.bytes
    return entry.value
  }

  set(key: string, value: T, bytes: number) {
    this.remove(key)
    if (this.maxBytes <= 0 || bytes > this.maxBytes) return
    while ((this.bytes + bytes > this.maxBytes || this.entries.size >= this.maxEntries) && this.entries.size) {
      this.remove(this.entries.keys().next().value!)
    }
    this.entries.set(key, { value, bytes, expiresAt: this.now() + this.ttlMs })
    this.bytes += bytes
  }

  private remove(key: string) {
    const entry = this.entries.get(key)
    if (entry) {
      this.bytes -= entry.bytes
      this.entries.delete(key)
    }
  }
}