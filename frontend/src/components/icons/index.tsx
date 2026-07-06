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
} from "./animated-icon";

export { AnimatedIcon };
export type { AnimatedIconProps };

/**
 * Central registry mapping a stable key → its Lucide icon. Nav/menu data
 * references icons by key so it stays serializable. Icons are static.
 */
export const iconRegistry = {
  // navigation / structure
  dashboard: LayoutDashboard,
  keys: KeyRound,
  key: Key,
  usage: BarChart3,
  analytics: LineChart,
  calculator: Calculator,
  billing: CreditCard,
  invoice: FileText,
  fileText: FileText,
  wallet: Wallet,
  support: LifeBuoy,
  headphones: Headphones,
  ticket: Ticket,
  settings: Settings,
  settings2: Settings2,
  profile: User,
  users: Users,
  admin: UserCog,
  company: Building2,
  docs: BookOpen,
  book: Book,
  code: Code2,
  terminal: Terminal,
  webhook: Webhook,
  notifications: Bell,
  bellRing: BellRing,

  // logistics / domain
  truck: Truck,
  package: Package,
  packageCheck: PackageCheck,
  boxes: Boxes,
  pin: MapPin,
  map: Map,
  zones: Layers,
  rateCard: ListChecks,
  database: Database,
  sync: RefreshCw,
  coins: Coins,
  percent: Percent,
  tag: Tag,
  audit: ScrollText,

  // status / meta
  activity: Activity,
  gauge: Gauge,
  trending: TrendingUp,
  zap: Zap,
  rocket: Rocket,
  sparkles: Sparkles,
  shield: Shield,
  shieldCheck: ShieldCheck,
  lock: Lock,
  verified: BadgeCheck,
  star: Star,
  globe: Globe,
  clock: Clock,
  timer: Timer,
  dollar: DollarSign,

  // actions
  plus: Plus,
  copy: Copy,
  check: Check,
  checkCircle: CheckCircle2,
  edit: Pencil,
  trash: Trash2,
  search: Search,
  filter: Filter,
  download: Download,
  upload: Upload,
  send: Send,
  mail: Mail,
  message: MessageSquare,
  logout: LogOut,
  link: Link2,
  external: ExternalLink,
  eye: Eye,
  eyeOff: EyeOff,
  more: MoreHorizontal,
  wrench: Wrench,
  menu: Menu,
  close: X,
  help: CircleHelp,
  github: Github,
  linkedin: Linkedin,
  instagram: Instagram,
  twitter: Twitter,

  // arrows / chevrons
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,

  // theme
  sun: Sun,
  moon: Moon,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;

export interface IconProps extends Omit<AnimatedIconProps, "icon"> {
  name: IconName;
}

/** Render a registered icon by name. Static — no animation. */
export function Icon({ name, ...props }: IconProps) {
  return <AnimatedIcon icon={iconRegistry[name]} {...props} />;
}

/** Resolve the raw Lucide component for a registry key. */
export function lucideFor(name: IconName): LucideIcon {
  return iconRegistry[name];
}
