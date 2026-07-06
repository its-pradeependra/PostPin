"use client";

import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Bell,
  BellRing,
  Book,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Code2,
  Coins,
  Copy,
  CreditCard,
  Database,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Gauge,
  Github,
  Globe,
  Instagram,
  Linkedin,
  Headphones,
  Key,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  Link2,
  ListChecks,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Map,
  Menu,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Package,
  PackageCheck,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Rocket,
  ScrollText,
  Search,
  Send,
  Settings,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Tag,
  Terminal,
  Ticket,
  Timer,
  Trash2,
  TrendingUp,
  Truck,
  Twitter,
  Upload,
  User,
  UserCog,
  Users,
  Wallet,
  Webhook,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import {
  AnimatedIcon,
  type AnimatedIconProps,
  type IconAnimation,
  type IconTrigger,
} from "./animated-icon";

export { AnimatedIcon };
export type { AnimatedIconProps, IconAnimation, IconTrigger };

/**
 * Central registry of every icon used across Postpin, each paired with a
 * sensible default animation. Nav/menu data references icons by key so it
 * stays serializable while still rendering animated icons.
 */
export const iconRegistry = {
  // navigation / structure
  dashboard: { icon: LayoutDashboard, animation: "pop" },
  keys: { icon: KeyRound, animation: "wiggle" },
  key: { icon: Key, animation: "wiggle" },
  usage: { icon: BarChart3, animation: "bounce" },
  analytics: { icon: LineChart, animation: "bounce" },
  calculator: { icon: Calculator, animation: "pop" },
  billing: { icon: CreditCard, animation: "swing" },
  invoice: { icon: FileText, animation: "pop" },
  fileText: { icon: FileText, animation: "pop" },
  wallet: { icon: Wallet, animation: "bounce" },
  support: { icon: LifeBuoy, animation: "spin" },
  headphones: { icon: Headphones, animation: "pulse" },
  ticket: { icon: Ticket, animation: "wiggle" },
  settings: { icon: Settings, animation: "spin" },
  settings2: { icon: Settings2, animation: "spin" },
  profile: { icon: User, animation: "pop" },
  users: { icon: Users, animation: "pop" },
  admin: { icon: UserCog, animation: "wiggle" },
  company: { icon: Building2, animation: "pop" },
  docs: { icon: BookOpen, animation: "swing" },
  book: { icon: Book, animation: "swing" },
  code: { icon: Code2, animation: "pop" },
  terminal: { icon: Terminal, animation: "pop" },
  webhook: { icon: Webhook, animation: "pulse" },
  notifications: { icon: Bell, animation: "swing" },
  bellRing: { icon: BellRing, animation: "swing" },

  // logistics / domain
  truck: { icon: Truck, animation: "bounce" },
  package: { icon: Package, animation: "bounce" },
  packageCheck: { icon: PackageCheck, animation: "pop" },
  boxes: { icon: Boxes, animation: "pop" },
  pin: { icon: MapPin, animation: "bounce" },
  map: { icon: Map, animation: "pop" },
  zones: { icon: Layers, animation: "pop" },
  rateCard: { icon: ListChecks, animation: "pop" },
  database: { icon: Database, animation: "pulse" },
  sync: { icon: RefreshCw, animation: "spin" },
  coins: { icon: Coins, animation: "bounce" },
  percent: { icon: Percent, animation: "wiggle" },
  tag: { icon: Tag, animation: "swing" },
  audit: { icon: ScrollText, animation: "pop" },

  // status / meta
  activity: { icon: Activity, animation: "pulse" },
  gauge: { icon: Gauge, animation: "pop" },
  trending: { icon: TrendingUp, animation: "bounce" },
  zap: { icon: Zap, animation: "ping" },
  rocket: { icon: Rocket, animation: "bounce" },
  sparkles: { icon: Sparkles, animation: "pulse" },
  shield: { icon: Shield, animation: "pop" },
  shieldCheck: { icon: ShieldCheck, animation: "pop" },
  lock: { icon: Lock, animation: "wiggle" },
  verified: { icon: BadgeCheck, animation: "pop" },
  star: { icon: Star, animation: "ping" },
  globe: { icon: Globe, animation: "spin" },
  clock: { icon: Clock, animation: "spin" },
  timer: { icon: Timer, animation: "pulse" },
  dollar: { icon: DollarSign, animation: "bounce" },

  // actions
  plus: { icon: Plus, animation: "pop" },
  copy: { icon: Copy, animation: "pop" },
  check: { icon: Check, animation: "pop" },
  checkCircle: { icon: CheckCircle2, animation: "pop" },
  edit: { icon: Pencil, animation: "wiggle" },
  trash: { icon: Trash2, animation: "wiggle" },
  search: { icon: Search, animation: "pop" },
  filter: { icon: Filter, animation: "bounce" },
  download: { icon: Download, animation: "bounce" },
  upload: { icon: Upload, animation: "bounce" },
  send: { icon: Send, animation: "jiggle" },
  mail: { icon: Mail, animation: "swing" },
  message: { icon: MessageSquare, animation: "pop" },
  logout: { icon: LogOut, animation: "jiggle" },
  link: { icon: Link2, animation: "pop" },
  external: { icon: ExternalLink, animation: "pop" },
  eye: { icon: Eye, animation: "pop" },
  eyeOff: { icon: EyeOff, animation: "pop" },
  more: { icon: MoreHorizontal, animation: "pop" },
  wrench: { icon: Wrench, animation: "wiggle" },
  menu: { icon: Menu, animation: "pop" },
  close: { icon: X, animation: "pop" },
  help: { icon: CircleHelp, animation: "pop" },
  github: { icon: Github, animation: "pop" },
  linkedin: { icon: Linkedin, animation: "pop" },
  instagram: { icon: Instagram, animation: "pop" },
  twitter: { icon: Twitter, animation: "pop" },

  // arrows / chevrons
  arrowRight: { icon: ArrowRight, animation: "jiggle" },
  arrowUpRight: { icon: ArrowUpRight, animation: "pop" },
  chevronDown: { icon: ChevronDown, animation: "bounce" },
  chevronRight: { icon: ChevronRight, animation: "jiggle" },

  // theme
  sun: { icon: Sun, animation: "spin" },
  moon: { icon: Moon, animation: "swing" },
} satisfies Record<string, { icon: LucideIcon; animation: IconAnimation }>;

export type IconName = keyof typeof iconRegistry;

export interface IconProps extends Omit<AnimatedIconProps, "icon" | "animation"> {
  name: IconName;
  /** Override the registry's default animation. */
  animation?: IconAnimation;
}

/** Render a registered animated icon by name. */
export function Icon({ name, animation, ...props }: IconProps) {
  const entry = iconRegistry[name];
  return <AnimatedIcon icon={entry.icon} animation={animation ?? entry.animation} {...props} />;
}

/** Resolve the raw Lucide component for a registry key (when AnimatedIcon isn't wanted). */
export function lucideFor(name: IconName): LucideIcon {
  return iconRegistry[name].icon;
}
