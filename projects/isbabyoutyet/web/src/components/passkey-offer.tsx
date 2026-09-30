import { FingerprintIcon } from "@phosphor-icons/react";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { Spinner } from "@workspace/ui/components/spinner";
import { useI18n } from "@/lib/i18n";

/**
 * Device sign-in control shared by the login and signup cards.
 */
export function PasskeyOffer(props: {
  description: string;
  disabled: boolean;
  errorMessage: string | null;
  label: string;
  onPress: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <Button
        className="w-full rounded-full font-extrabold pop-shadow"
        disabled={props.disabled || props.pending}
        onClick={props.onPress}
        size="lg"
        type="button"
      >
        {props.pending ? <Spinner /> : <FingerprintIcon className="size-4" />}
        {props.label}
      </Button>
      <p className="text-center text-sm font-medium text-muted-foreground">{props.description}</p>
      {props.errorMessage === null ? null : (
        <p className="text-center text-sm font-semibold text-destructive" role="alert">
          {props.errorMessage}
        </p>
      )}
      <div className="flex items-center gap-3 py-1">
        <Separator className="flex-1" />
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("or")}
        </span>
        <Separator className="flex-1" />
      </div>
    </div>
  );
}
