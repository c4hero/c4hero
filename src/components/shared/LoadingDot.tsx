export default function LoadingDot() {
  return (
    <div
      aria-label="Loading"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--color-text-muted)',
          animation: 'pulse 1s ease-in-out infinite',
        }}
      />
    </div>
  )
}
