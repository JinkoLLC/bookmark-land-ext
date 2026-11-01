import type { CSSProperties } from "react";
import {
  Archive,
  Book,
  BookOpen,
  Bookmark,
  Box,
  Briefcase,
  Building,
  Calendar,
  Camera,
  Car,
  Clock,
  Cloud,
  Code,
  Coffee,
  Cpu,
  Database,
  FileText,
  Flag,
  Flame,
  Folder,
  FolderOpen,
  Gamepad2,
  Gift,
  Globe,
  GraduationCap,
  Headphones,
  Heart,
  Home,
  Image,
  Leaf,
  Lightbulb,
  Lock,
  Map,
  Monitor,
  Moon,
  Music,
  Newspaper,
  Palette,
  Pencil,
  Plane,
  Rocket,
  Shield,
  ShoppingCart,
  Smartphone,
  Star,
  Sun,
  Tag,
  Target,
  Trophy,
  Utensils,
  Video,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  folder: Folder,
  "folder-open": FolderOpen,
  star: Star,
  heart: Heart,
  bookmark: Bookmark,
  globe: Globe,
  code: Code,
  music: Music,
  camera: Camera,
  image: Image,
  video: Video,
  book: Book,
  "book-open": BookOpen,
  newspaper: Newspaper,
  "file-text": FileText,
  archive: Archive,
  box: Box,
  "shopping-cart": ShoppingCart,
  home: Home,
  building: Building,
  briefcase: Briefcase,
  "graduation-cap": GraduationCap,
  lightbulb: Lightbulb,
  rocket: Rocket,
  plane: Plane,
  car: Car,
  coffee: Coffee,
  utensils: Utensils,
  "gamepad-2": Gamepad2,
  headphones: Headphones,
  monitor: Monitor,
  smartphone: Smartphone,
  cpu: Cpu,
  database: Database,
  cloud: Cloud,
  lock: Lock,
  shield: Shield,
  zap: Zap,
  flame: Flame,
  leaf: Leaf,
  sun: Sun,
  moon: Moon,
  palette: Palette,
  pencil: Pencil,
  wrench: Wrench,
  flag: Flag,
  tag: Tag,
  clock: Clock,
  calendar: Calendar,
  map: Map,
  gift: Gift,
  trophy: Trophy,
  target: Target,
};

function isEmoji(icon: string): boolean {
  return (icon.codePointAt(0) ?? 0) > 127;
}

function iconName(icon: string): string {
  return icon.replace(/:filled$/, "");
}

function isIconFilled(icon: string): boolean {
  return icon.endsWith(":filled");
}

/**
 * Mirrors the web app's CollectionIcon look: emoji icons render as text,
 * named lucide icons render from the same icon set as the web sidebar, and
 * unknown/missing icons fall back to a folder tinted with the collection color.
 */
export function CollectionGlyph({
  icon,
  color,
  className = "h-4 w-4",
}: {
  icon?: string;
  color?: string;
  className?: string;
}) {
  const style = (color ? { color } : undefined) as CSSProperties | undefined;

  if (icon && isEmoji(icon)) {
    return (
      <span
        aria-hidden
        className={`${className} flex shrink-0 items-center justify-center text-[13px] leading-none`}
        style={style}
      >
        {icon}
      </span>
    );
  }

  const Icon = icon ? (ICON_MAP[iconName(icon)] ?? Folder) : Folder;
  return (
    <Icon
      aria-hidden
      className={`${className} shrink-0`}
      style={style}
      fill={icon && isIconFilled(icon) ? "currentColor" : "none"}
    />
  );
}

function svgProps(className: string, color?: string) {
  return {
    className,
    style: (color ? { color } : undefined) as CSSProperties | undefined,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

/** Web-sidebar-style expand/collapse chevron. */
export function Chevron({
  open,
  className = "h-3.5 w-3.5",
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <svg {...svgProps(className)}>
      <path d={open ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

/** The web app's published-collection marker (lucide Radio). */
export function RadioIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg {...svgProps(className)}>
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
      <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
    </svg>
  );
}
