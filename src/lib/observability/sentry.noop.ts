/** Extension-build replacement: error reporting stays local to VS Code logs. */
export function initSentry(): boolean { return false }
export function captureException(): void {}
export function resetSentryForTests(): void {}
