import { Database, Circle, Hexagon, Diamond, UserRound, Bot, Folder, Globe, Smartphone, Box, Monitor, Zap, GitMerge, HardDrive, Puzzle, type LucideIcon } from 'lucide-react'
import type { ElementStyle, ModelElement } from '@/types/model'

export const SHAPE_ICON_MAP: Record<string, LucideIcon> = {
  Cylinder: Database, Circle, Ellipse: Circle, Hexagon, Diamond, Person: UserRound,
  Robot: Bot, Folder, WebBrowser: Globe, MobileDevicePortrait: Smartphone, MobileDeviceLandscape: Smartphone,
}
export const CONTAINER_ICON_MAP: Record<string, LucideIcon> = {
  Database, 'Web Application': Monitor, Service: Zap, Queue: GitMerge, 'Mobile App': Smartphone, 'File System': HardDrive,
}
export function containerIcon(tags: string[]) {
  return Object.entries(CONTAINER_ICON_MAP).find(([tag]) => tags.includes(tag))?.[1] ?? Box
}
export function nodeIcon(element: ModelElement, style?: ElementStyle) {
  return (style?.shape && SHAPE_ICON_MAP[style.shape]) || (element.type === 'person' ? UserRound : element.type === 'softwareSystem' ? Globe : element.type === 'component' ? Puzzle : containerIcon(element.tags))
}
export const NODE_ICONS = [...new Set([...Object.values(SHAPE_ICON_MAP), ...Object.values(CONTAINER_ICON_MAP), Box, Puzzle])]
