export interface HostFile {
  uri: string
  name: string
  read(): Promise<string>
  write(content: string): Promise<void>
}

export interface HostFolder {
  uri: string
  name: string
  list(): Promise<string[]>
  read(relativePath: string): Promise<string | null>
  write(relativePath: string, content: string): Promise<void>
}

/** Host-neutral filesystem surface used by browser and embedded clients. */
export interface HostFs {
  readonly kind: 'browser' | 'vscode'
  openFile(): Promise<HostFile | null>
  openFolder(): Promise<HostFolder | null>
  read(uri: string): Promise<string | null>
  write(uri: string, content: string): Promise<void>
  list(uri: string): Promise<string[]>
  watch(uri: string, listener: () => void): () => void
  persist(uri: string): Promise<void>
  restore(): Promise<string | null>
}
