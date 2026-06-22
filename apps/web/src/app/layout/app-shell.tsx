import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  ChevronDown,
  KeyRound,
  Clock3,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftDashed,
  PanelLeftOpen,
  Settings,
  Sun,
  UserRoundSearch,
  Users,
  Workflow
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/features/auth/auth-provider";
import { useTheme } from "@/features/theme/theme-provider";
import { listWorkspaces } from "@/shared/api/workspaces";
import { queryKeys } from "@/shared/api/query-keys";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/shared/ui/dropdown-menu";
import { Separator } from "@/shared/ui/separator";

type SidebarMode = "auto" | "pinned" | "minimal";

const SIDEBAR_MODE_STORAGE_KEY = "vigil.sidebarMode";

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaceId } = useParams();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(getInitialSidebarMode);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [isSidebarModeMenuOpen, setIsSidebarModeMenuOpen] = useState(false);
  const workspacesQuery = useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: listWorkspaces
  });

  const currentWorkspace = workspacesQuery.data?.find((workspace) => workspace.id === workspaceId);
  const workspaceBasePath = currentWorkspace ? `/app/workspaces/${currentWorkspace.id}` : "/app/workspaces";
  const userInitials = getInitials(auth.user?.displayName ?? auth.user?.email ?? "FP");
  const isSidebarExpanded =
    sidebarMode === "pinned" || (sidebarMode === "auto" && (isSidebarHovered || isSidebarModeMenuOpen));

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, sidebarMode);
  }, [sidebarMode]);

  function signOut() {
    auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "liquid-bar hidden shrink-0 border-r border-border bg-card transition-[width] duration-200 md:flex md:flex-col",
          isSidebarExpanded ? "w-64" : "w-16"
        )}
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div
          className={cn(
            "flex h-16 items-center gap-2 px-3",
            isSidebarExpanded ? "justify-between" : "justify-center"
          )}
        >
          {isSidebarExpanded ? (
            <>
              <Link aria-label="Vigil Summit" className="flex min-w-0 items-center gap-3" to="/app/workspaces">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground dark:shadow-[0_0_32px_rgba(192,132,252,0.3)]">
                  <Bot className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold leading-none">Vigil Summit</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">Engagement operations</p>
                </div>
              </Link>
              <SidebarModeMenu
                mode={sidebarMode}
                onModeChange={setSidebarMode}
                onOpenChange={setIsSidebarModeMenuOpen}
                open={isSidebarModeMenuOpen}
              />
            </>
          ) : (
            <SidebarModeMenu
              mode={sidebarMode}
              onModeChange={setSidebarMode}
              onOpenChange={setIsSidebarModeMenuOpen}
              open={isSidebarModeMenuOpen}
            />
          )}
        </div>
        <Separator />
        <nav className={cn("flex-1 space-y-1 p-3", !isSidebarExpanded && "px-2")}>
          <SidebarLink
            collapsed={!isSidebarExpanded}
            end
            icon={LayoutDashboard}
            to="/app/workspaces"
            label="Workspaces"
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={CalendarDays}
            to={`${workspaceBasePath}/events`}
            label="Events"
            disabled={!currentWorkspace}
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={Activity}
            to={`${workspaceBasePath}/engagement`}
            label="Engagement"
            disabled={!currentWorkspace}
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={Workflow}
            to={`${workspaceBasePath}/workflows`}
            label="Workflows"
            disabled={!currentWorkspace}
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={UserRoundSearch}
            to={`${workspaceBasePath}/leads`}
            label="Leads"
            disabled={!currentWorkspace}
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={Clock3}
            to={`${workspaceBasePath}/executions`}
            label="Executions"
            disabled={!currentWorkspace}
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={KeyRound}
            to={`${workspaceBasePath}/credentials`}
            label="Credentials"
            disabled={!currentWorkspace}
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={Users}
            to={`${workspaceBasePath}/members`}
            label="Members"
            disabled={!currentWorkspace}
          />
          <SidebarLink
            collapsed={!isSidebarExpanded}
            icon={Settings}
            to={`${workspaceBasePath}/settings`}
            label="Settings"
            disabled={!currentWorkspace}
          />
        </nav>
        {isSidebarExpanded ? (
          <div className="p-3">
            <p className="px-3 text-xs text-muted-foreground">
              Sidebar: {getSidebarModeLabel(sidebarMode)}
            </p>
          </div>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="liquid-bar flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{getBreadcrumb(location.pathname)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {currentWorkspace?.name ?? "Workspace overview"}
            </p>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Button
              aria-label={`Switch to ${theme.theme === "dark" ? "light" : "dark"} mode`}
              onClick={theme.toggleTheme}
              size="icon"
              variant="ghost"
            >
              {theme.theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="max-w-52 justify-between" variant="outline">
                  <span className="truncate">{currentWorkspace?.name ?? "Workspaces"}</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Workspace</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {workspacesQuery.data?.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onClick={() => navigate(`/app/workspaces/${workspace.id}/workflows`)}
                  >
                    <span className="truncate">{workspace.name}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/app/workspaces")}>All workspaces</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Open user menu" size="icon" variant="ghost">
                  <Avatar>
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <span className="block truncate">{auth.user?.displayName ?? "Vigil Operator"}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {auth.user?.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={theme.toggleTheme}>
                  {theme.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  {theme.theme === "dark" ? "Light mode" : "Dark mode"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto dark:bg-transparent">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({
  collapsed,
  icon: Icon,
  end,
  to,
  label,
  disabled
}: {
  collapsed: boolean;
  end?: boolean;
  icon: typeof LayoutDashboard;
  to: string;
  label: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span
        aria-label={label}
        className={cn(
          "flex h-9 items-center rounded-md text-sm text-muted-foreground opacity-60",
          collapsed ? "justify-center px-0" : "gap-3 px-3"
        )}
        title={label}
      >
        <Icon className="size-4 shrink-0" />
        {collapsed ? null : label}
      </span>
    );
  }

  return (
    <NavLink
      className={({ isActive }) =>
        cn(
          "flex h-9 items-center rounded-md text-sm font-medium transition-colors hover:bg-muted",
          collapsed ? "justify-center px-0" : "gap-3 px-3",
          isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
        )
      }
      end={end}
      title={label}
      to={to}
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : label}
    </NavLink>
  );
}

function SidebarModeMenu({
  mode,
  onModeChange,
  onOpenChange,
  open
}: {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const Icon = mode === "pinned" ? PanelLeftOpen : mode === "minimal" ? PanelLeftClose : PanelLeftDashed;

  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Sidebar display" size="icon" variant="ghost">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Sidebar</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onModeChange("auto")}>
          <PanelLeftDashed className="size-4" />
          Auto-hide
          {mode === "auto" ? <span className="ml-auto text-xs text-muted-foreground">Active</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onModeChange("pinned")}>
          <PanelLeftOpen className="size-4" />
          Keep open
          {mode === "pinned" ? <span className="ml-auto text-xs text-muted-foreground">Active</span> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onModeChange("minimal")}>
          <PanelLeftClose className="size-4" />
          Minimal
          {mode === "minimal" ? <span className="ml-auto text-xs text-muted-foreground">Active</span> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function getInitialSidebarMode(): SidebarMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const storedMode = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY);
  return storedMode === "pinned" || storedMode === "minimal" || storedMode === "auto" ? storedMode : "auto";
}

function getSidebarModeLabel(mode: SidebarMode) {
  if (mode === "pinned") {
    return "keep open";
  }

  if (mode === "minimal") {
    return "minimal";
  }

  return "auto-hide";
}

function getBreadcrumb(pathname: string) {
  if (pathname.endsWith("/engagement")) {
    return "Engagement";
  }
  if (pathname.includes("/executions/")) {
    return "Execution Detail";
  }

  if (pathname.includes("/workflows/")) {
    return "Workflow Detail";
  }

  if (pathname.endsWith("/workflows")) {
    return "Workflows";
  }

  if (pathname.endsWith("/executions")) {
    return "Executions";
  }

  if (pathname.endsWith("/leads")) {
    return "Leads";
  }

  if (pathname.endsWith("/members")) {
    return "Members";
  }

  if (pathname.endsWith("/settings")) {
    return "Settings";
  }

  return "Workspaces";
}

function getInitials(value: string) {
  return value
    .split(/[.\s@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
