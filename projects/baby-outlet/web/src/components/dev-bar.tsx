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
import { CheckIcon, CodeIcon, HouseIcon, SignInIcon } from "@phosphor-icons/react";
import { Link, useRouterState } from "@tanstack/react-router";

/** @internal Exported for tests. */
export function activeBabyPublicId(pathname: string) {
  const match = pathname.match(/^\/baby\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * The shortcut for the page you are already on is marked `aria-current`, which
 * is also how tests tell an active entry from an inactive one (every entry
 * renders an icon, so the check mark alone is not observable).
 */
function currentPage(isActive: boolean) {
  return isActive ? ("page" as const) : undefined;
}

/**
 * Floating shortcuts to seeded demo babies. Call sites must gate on
 * `hasDemoLogin` (`import.meta.env.DEV` / `VITE_HAS_DEMO_LOGIN`) so production
 * builds never mount this component — do not render `{false && <DevBar />}`
 * wrappers that still evaluate an `enabled` prop at runtime.
 */
export function DevBar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentPublicId = activeBabyPublicId(pathname);
  const onDashboard = pathname.startsWith("/dashboard");
  const onLogin = pathname.startsWith("/auth/login");
  const onPreview = pathname.startsWith("/preview");

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4 max-sm:top-16">
      <DropdownMenu key={pathname}>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Developer shortcuts"
              className="pointer-events-auto rounded-full border-2 bg-background/90 font-extrabold shadow-sm backdrop-blur-md max-sm:size-8 max-sm:px-0 max-sm:has-data-[icon=inline-start]:pl-0"
              size="sm"
              type="button"
              variant="outline"
            />
          }
        >
          <CodeIcon data-icon="inline-start" />
          <span className="max-sm:sr-only">Dev</span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="center" className="w-72" side="bottom" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Seeded babies · {DEMO_USER.email}</DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel>Status stages</DropdownMenuLabel>
            {DEMO_BABIES.map((baby) => (
              <DropdownMenuItem
                key={baby.publicId}
                render={
                  <Link
                    aria-current={currentPage(currentPublicId === baby.publicId)}
                    params={{ publicId: baby.publicId }}
                    to="/baby/$publicId"
                  />
                }
              >
                {currentPublicId === baby.publicId ? <CheckIcon data-icon="inline-start" /> : null}
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
                  render={
                    <Link
                      aria-current={currentPage(currentPublicId === baby.publicId)}
                      params={{ publicId: baby.publicId }}
                      to="/baby/$publicId"
                    />
                  }
                >
                  {currentPublicId === baby.publicId ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{baby.name}</span>
                  <span className="text-muted-foreground">{locale}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuLabel>Pages</DropdownMenuLabel>
            <DropdownMenuItem
              render={<Link aria-current={currentPage(onDashboard)} to="/dashboard" />}
            >
              {onDashboard ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <HouseIcon data-icon="inline-start" />
              )}
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link aria-current={currentPage(onLogin)} to="/auth/login" />}
            >
              {onLogin ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <SignInIcon data-icon="inline-start" />
              )}
              Login
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link aria-current={currentPage(onPreview)} to="/preview" />}>
              {onPreview ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CodeIcon data-icon="inline-start" />
              )}
              Preview
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
