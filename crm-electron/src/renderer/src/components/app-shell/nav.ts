import {
  BookOpen,
  Boxes,
  Building2,
  Dumbbell,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  group: string;
}

export const navItems: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, group: "Main" },
  { title: "All Leads", url: "/leads", icon: Users, group: "Leads" },
  { title: "Clients", url: "/clients", icon: Building2, group: "Clients" },
  {
    title: "Membership Sales",
    url: "/accounting/sales",
    icon: Receipt,
    group: "Sales",
  },
  {
    title: "Receipts",
    url: "/accounting/receipts",
    icon: BookOpen,
    group: "Sales",
  },
  {
    title: "Services",
    url: "/logistics/services",
    icon: Dumbbell,
    group: "Logistics",
  },
  {
    title: "Products",
    url: "/logistics/products",
    icon: Package,
    group: "Logistics",
  },
  {
    title: "Inventory",
    url: "/logistics/inventory",
    icon: Boxes,
    group: "Logistics",
  },
  { title: "Settings", url: "/settings", icon: Settings, group: "Organization" },
];
