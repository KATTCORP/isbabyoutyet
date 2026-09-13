import { hasDemoLogin } from "@/lib/has-demo-login";
import {
  DEMO_BABIES,
  DEMO_USER,
  HOMEPAGE_DEMO_BABIES,
} from "@baby-outlet/backend/src/seedCredentials";
import { SUPPORTED_LOCALES } from "@baby-outlet/backend/src/i18n";
import { Button } from "@workspace/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Check, Code, House, SignIn } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function activeBabyPublicId(pathname: string) {
  const match = pathname.match(/^\/baby\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * Floating shortcuts to seeded demo babies. Only mounts in local DEV and
 * Vercel preview (same gate as demo login autofill).
 */
export function DevBar() {
  if (!hasDemoLogin) return null;
  return <DevBarPanel />;
}

function DevBarPanel() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentPublicId = activeBabyPublicId(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto rounded-full border-2 bg-background/90 font-extrabold shadow-sm backdrop-blur-md"
              aria-label="Developer shortcuts"
            />
          }
        >
          <Code data-icon="inline-start" />
          Dev
        </DropdownMenuTrigger>

        <DropdownMenuContent align="center" side="bottom" sideOffset={8} className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Seeded babies · {DEMO_USER.email}</DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel>Status stages</DropdownMenuLabel>
            {DEMO_BABIES.map((baby) => (
              <DropdownMenuItem
                key={baby.publicId}
                render={<Link to="/baby/$publicId" params={{ publicId: baby.publicId }} />}
              >
                {currentPublicId === baby.publicId ? <Check data-icon="inline-start" /> : null}
                <span className="min-w-0 flex-1 truncate">{baby.label}</span>
                <span className="text-muted-foreground">{baby.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel>Homepage demos</DropdownMenuLabel>
            {SUPPORTED_LOCALES.map((locale) => {
              const baby = HOMEPAGE_DEMO_BABIES[locale];
              return (
                <DropdownMenuItem
                  key={baby.publicId}
                  render={<Link to="/baby/$publicId" params={{ publicId: baby.publicId }} />}
                >
                  {currentPublicId === baby.publicId ? <Check data-icon="inline-start" /> : null}
                  <span className="min-w-0 flex-1 truncate">{baby.name}</span>
                  <span className="text-muted-foreground">{locale}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel>Pages</DropdownMenuLabel>
            <DropdownMenuItem render={<Link to="/dashboard" />}>
              {pathname.startsWith("/dashboard") ? (
                <Check data-icon="inline-start" />
              ) : (
                <House data-icon="inline-start" />
              )}
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/auth/login" />}>
              {pathname.startsWith("/auth/login") ? (
                <Check data-icon="inline-start" />
              ) : (
                <SignIn data-icon="inline-start" />
              )}
              Login
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/preview" />}>
              {pathname.startsWith("/preview") ? (
                <Check data-icon="inline-start" />
              ) : (
                <Code data-icon="inline-start" />
              )}
              Preview
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
