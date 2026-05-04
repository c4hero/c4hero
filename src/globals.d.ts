declare const __COMMIT_HASH__: string
declare const __APP_VERSION__: string

// File System Access API extensions not yet in TypeScript lib
interface FileSystemHandle {
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>
}

interface Window {
  showDirectoryPicker(options?: { mode?: 'read' | 'readwrite'; startIn?: string }): Promise<FileSystemDirectoryHandle>
}
