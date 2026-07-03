"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/utils";

interface UserMenuProps {
  name: string;
  email: string;
  avatar?: string;
  variant?: "portal" | "admin";
  onSignOut?: () => void;
}

export function UserMenu({ name, email, avatar, variant = "portal", onSignOut }: UserMenuProps) {
  const settingsHref = variant === "admin" ? "/admin/settings" : "/app/settings";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="user-menu-trigger"
          className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-8">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <Icon name="chevronDown" trigger="hover" size={14} className="text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="truncate text-sm font-semibold normal-case tracking-normal text-foreground">
              {name}
            </span>
            <span className="truncate text-xs font-normal normal-case tracking-normal text-muted-foreground">
              {email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={settingsHref} data-testid="user-menu-settings">
            <Icon name="settings" size={16} /> Settings
          </Link>
        </DropdownMenuItem>
        {variant === "portal" && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/app/billing" data-testid="user-menu-billing">
                <Icon name="billing" size={16} /> Billing & plan
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/docs" data-testid="user-menu-docs">
                <Icon name="docs" size={16} /> Documentation
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          data-testid="user-menu-logout"
          onSelect={(e) => {
            e.preventDefault();
            onSignOut?.();
          }}
        >
          <Icon name="logout" size={16} /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
