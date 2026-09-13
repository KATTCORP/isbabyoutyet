import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { createFileRoute } from "@tanstack/react-router";
import { FormGuardProvider } from "@/components/Form";
import { useI18n } from "@/lib/i18n";
import { openOverlayLink, useBabySignupOverlay } from "@/lib/overlay-nav";
import { signUpThenGo } from "@/lib/auth-client";
import { SignupCard } from "@/routes/auth/signup";

export const Route = createFileRoute("/baby/$publicId/signup")({
  component: BabySignupOverlay,
});

export function BabySignupOverlay() {
  const { t } = useI18n();
  const context = Route.useRouteContext();
  const params = Route.useParams();
  const signup = useBabySignupOverlay(params.publicId);

  return (
    <Dialog {...signup.rootProps}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("Join the fun!")}</DialogTitle>
          <DialogDescription>
            {t("Create an account to share your baby's arrival")}
          </DialogDescription>
        </DialogHeader>
        <FormGuardProvider guard={signup.guard}>
          <SignupCard
            onSignUp={(values) =>
              signUpThenGo(values, {
                convexClient: context.convexClient,
                convexQueryClient: context.convexQueryClient,
                navigate: () => signup.close(),
                queryClient: context.queryClient,
                t,
              })
            }
            signInLink={{
              ...openOverlayLink({
                params: { publicId: params.publicId },
                to: "/baby/$publicId/login",
              }),
              replace: true,
            }}
          />
        </FormGuardProvider>
      </DialogContent>
    </Dialog>
  );
}
