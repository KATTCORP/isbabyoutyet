import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { toast } from "sonner";
import * as z from "zod";
import { api } from "@baby-outlet/backend/convex/_generated/api";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { Form, useZodForm } from "@/components/Form";
import { LanguagePicker } from "@/components/language-picker";
import type { InitiatedConvexQuery, PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";
import { setLocale } from "@/lib/paraglide-setup";

function languageRequestSchema(t: TranslationFunction) {
  return z
    .object({
      requestedLocale: z
        .string()
        .trim()
        .min(2, t("Enter a language name or language code"))
        .max(100),
    })
    .transform((values): FunctionArgs<typeof api.profile.requestLanguage> => values);
}

function LanguageRequestForm(props: { onSaved: () => void }) {
  const { t } = useI18n();
  const requestLanguage = useMutation(api.profile.requestLanguage);
  const form = useZodForm({
    schema: languageRequestSchema(t),
    defaultValues: { requestedLocale: "" },
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await requestLanguage(values);
        props.onSaved();
        toast.success(t("Language request saved"));
      }}
    >
      <FormField
        control={form.control}
        name="requestedLocale"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("Language name or code")}</FormLabel>
            <FormControl>
              <Input maxLength={100} placeholder={t("Example: French / fr-FR")} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <DialogFooter>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t("Send request")}
        </Button>
      </DialogFooter>
    </Form>
  );
}

export function LanguageSettings(props: {
  profile:
    | PreloadedConvexQuery<typeof api.profile.get>
    | InitiatedConvexQuery<typeof api.profile.get>;
}) {
  const { locale, t } = useI18n();
  const profileQuery = usePreloadedConvexQuery(api.profile.get, props.profile);
  const profile = profileQuery.data;
  const updateLocale = useMutation(api.profile.updateLocale);
  const [requestOpen, setRequestOpen] = useState(false);
  const selectedLocale = profile?.locale ?? locale;

  return (
    <div className="flex items-center gap-2">
      <LanguagePicker
        value={selectedLocale}
        disabled={!profile}
        label={t("Profile language")}
        onValueChange={async (value) => {
          await updateLocale({ locale: value });
          await setLocale(value);
        }}
      />

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              {t("Request another language")}
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Request another language")}</DialogTitle>
            <DialogDescription>
              {t("Tell us which language you would like us to add.")}
            </DialogDescription>
          </DialogHeader>
          {requestOpen ? <LanguageRequestForm onSaved={() => setRequestOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
