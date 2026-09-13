import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { overlayLoginSuccessTarget } from "@/lib/baby-login-redirect";
import { hasDemoLogin } from "@/lib/has-demo-login";
import { useI18n } from "@/lib/i18n";
import { openOverlayLink, useBabyLoginOverlay } from "@/lib/overlay-nav";
import { signInThenGo } from "@/lib/auth-client";
import { LoginCard } from "@/routes/auth/login";

export const Route = createFileRoute("/baby/$publicId/login")({
  component: BabyLoginOverlay,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
});

export function BabyLoginOverlay() {
  const { t } = useI18n();
  const context = Route.useRouteContext();
  const params = Route.useParams();
  const router = useRouter();
  const search = Route.useSearch();
  const login = useBabyLoginOverlay(params.publicId);
  const successTarget = overlayLoginSuccessTarget(search.redirect);

  return (
    <Dialog {...login.rootProps}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("Welcome back!")}</DialogTitle>
          <DialogDescription>{t("Sign in to keep everyone in the loop")}</DialogDescription>
        </DialogHeader>
        <LoginCard
          demoLoginEnabled={hasDemoLogin}
          onSignIn={(values) =>
            signInThenGo(values, {
              convexClient: context.convexClient,
              convexQueryClient: context.convexQueryClient,
              navigate: () =>
                successTarget === null ? login.close() : router.navigate(successTarget),
              queryClient: context.queryClient,
              t,
            })
          }
          signUpLink={{
            ...openOverlayLink({
              params: { publicId: params.publicId },
              to: "/baby/$publicId/signup",
            }),
            replace: true,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
