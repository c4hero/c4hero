import { UserRound, Globe, Box, Puzzle } from 'lucide-react'

export const TYPE_ICONS: Record<string, React.ReactNode> = {
  person: <UserRound size={14} />,
  softwareSystem: <Globe size={14} />,
  container: <Box size={14} />,
  component: <Puzzle size={14} />,
}

export const TYPE_COLORS: Record<string, string> = {
  person: 'var(--color-type-person)',
  softwareSystem: 'var(--color-type-system)',
  container: 'var(--color-type-container)',
  component: 'var(--color-type-component)',
}

export const TYPE_LABELS: Record<string, string> = {
  person: 'Person',
  softwareSystem: 'Software System',
  container: 'Container',
  component: 'Component',
}
