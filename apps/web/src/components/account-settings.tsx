import { CheckIcon, EnvelopeSimpleIcon, KeyIcon, UserIcon } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@workspace/convex/convex/_generated/api";
import type { PreloadedConvexQuery } from "@workspace/convex-prefetch";
import { usePreloadedConvexQuery } from "@workspace/convex-prefetch";
import { Button } from "@workspace/ui/components/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@workspace/ui/components/item";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Spinner } from "@workspace/ui/components/spinner";
import { useFormState } from "react-hook-form";
import {
  Form,
  FormCancelButton,
  FormGuardProvider,
  SubmitButton,
  useFormGuard,
  useZodForm,
} from "@/components/Form";
import { authClient } from "@/lib/auth-client";
import type { TranslationFunction } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n";

function nameSchema(t: TranslationFunction) {
  return z.object({
    name: z.string().trim().min(2, t("Name must be at least 2 characters")),
  });
}

function changeEmailSchema(t: TranslationFunction, currentEmail: string) {
  return z
    .object({
      newEmail: z
        .string()
        .trim()
        .check(z.email(t("Invalid email address"))),
    })
    .refine((values) => values.newEmail.toLowerCase() !== currentEmail.toLowerCase(), {
      message: t("Choose a different email address."),
      path: ["newEmail"],
    });
}

function passwordSchema(t: TranslationFunction) {
  return z
    .object({
      confirmPassword: z.string(),
      currentPassword: z.string().min(1, t("Current password is required.")),
      newPassword: z.string().min(8, t("Password must be at least 8 characters")),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      message: t("Passwords do not match"),
      path: ["confirmPassword"],
    });
}

function EditorActions() {
  const { t } = useI18n();
  const { isDirty } = useFormState();
  return (
    <div className="flex justify-end gap-2">
      <PopoverClose render={<FormCancelButton form="context" size="sm" />}>
        {t("Cancel")}
      </PopoverClose>
      <SubmitButton
        disabled={!isDirty}
        form="context"
        IconComponent={CheckIcon}
        iconPosition="start"
        size="sm"
      >
        {t("Save")}
      </SubmitButton>
    </div>
  );
}

/**
 * Account rows for the dashboard settings sheet: name and password go through
 * Better Auth's session, email through the Convex `accountEmail.change`
 * mutation. `profile.get` is live, so a saved change shows up in the row.
 */
export function AccountSettings(props: { profile: PreloadedConvexQuery<typeof api.profile.get> }) {
  const { t } = useI18n();
  const profile = usePreloadedConvexQuery(api.profile.get, props.profile).data;

  if (profile === null || profile === undefined) {
    return (
      <Item>
        <ItemContent>
          <Spinner className="size-4" />
          <span className="sr-only">{t("Loading")}</span>
        </ItemContent>
      </Item>
    );
  }

  return (
    <>
      <Item>
        <ItemMedia variant="icon">
          <UserIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t("Your name")}</ItemTitle>
          <ItemDescription>{profile.name}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <NameEditor name={profile.name} />
        </ItemActions>
      </Item>

      <ItemSeparator />

      <Item>
        <ItemMedia variant="icon">
          <EnvelopeSimpleIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t("Email")}</ItemTitle>
          <ItemDescription>{profile.email}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <EmailEditor email={profile.email} />
        </ItemActions>
      </Item>

      <ItemSeparator />

      <Item>
        <ItemMedia variant="icon">
          <KeyIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t("Password")}</ItemTitle>
          <ItemDescription>
            {t("Use at least eight characters for your new password.")}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <PasswordEditor />
        </ItemActions>
      </Item>
    </>
  );
}

function NameEditor(props: { name: string }) {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button aria-label={t("Edit name")} size="sm" variant="outline">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <FormGuardProvider guard={overlay}>
          <NameForm name={props.name} onClose={overlay.close} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function NameForm(props: { name: string; onClose: () => void }) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: { name: props.name },
    schema: nameSchema(t),
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        const result = await authClient.updateUser({ name: values.name });
        if (result.error) {
          throw new Error(result.error.message || t("Unable to update your name"));
        }
        toast.success(t("Your name has been updated."));
        props.onClose();
      }}
    >
      <FormField
        control={form.control}
        name="name"
        render={(renderProps) => (
          <FormItem className="mb-3">
            <FormControl>
              <Input aria-label={t("Your name")} autoComplete="name" {...renderProps.field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <EditorActions />
    </Form>
  );
}

function EmailEditor(props: { email: string }) {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button aria-label={t("Edit email")} size="sm" variant="outline">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <FormGuardProvider guard={overlay}>
          <EmailForm email={props.email} onClose={overlay.close} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function EmailForm(props: { email: string; onClose: () => void }) {
  const { t } = useI18n();
  const changeAccountEmail = useMutation(api.accountEmail.change);
  const form = useZodForm({
    defaultValues: { newEmail: props.email },
    schema: changeEmailSchema(t, props.email),
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await changeAccountEmail({ newEmail: values.newEmail });
        toast.success(t("Your email has been updated."));
        props.onClose();
      }}
    >
      <FormField
        control={form.control}
        name="newEmail"
        render={(renderProps) => (
          <FormItem className="mb-3">
            <FormLabel className="font-bold">{t("New email")}</FormLabel>
            <FormControl>
              <Input autoComplete="email" type="email" {...renderProps.field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <EditorActions />
    </Form>
  );
}

function PasswordEditor() {
  const { t } = useI18n();
  const overlay = useFormGuard({ defaultOpen: false });

  return (
    <Popover {...overlay.rootProps}>
      <PopoverTrigger
        render={
          <Button aria-label={t("Edit password")} size="sm" variant="outline">
            {t("Edit")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1rem)]">
        <FormGuardProvider guard={overlay}>
          <PasswordForm onClose={overlay.close} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function PasswordForm(props: { onClose: () => void }) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: {
      confirmPassword: "",
      currentPassword: "",
      newPassword: "",
    },
    schema: passwordSchema(t),
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        const result = await authClient.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
          revokeOtherSessions: true,
        });
        if (result.error) {
          throw new Error(result.error.message || t("Unable to update your password"));
        }
        toast.success(t("Your password has been updated."));
        props.onClose();
      }}
    >
      <div className="mb-3 flex flex-col gap-3">
        <FormField
          control={form.control}
          name="currentPassword"
          render={(renderProps) => (
            <FormItem>
              <FormLabel className="font-bold">{t("Current password")}</FormLabel>
              <FormControl>
                <Input autoComplete="current-password" type="password" {...renderProps.field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={(renderProps) => (
            <FormItem>
              <FormLabel className="font-bold">{t("New password")}</FormLabel>
              <FormControl>
                <Input autoComplete="new-password" type="password" {...renderProps.field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={(renderProps) => (
            <FormItem>
              <FormLabel className="font-bold">{t("Confirm new password")}</FormLabel>
              <FormControl>
                <Input autoComplete="new-password" type="password" {...renderProps.field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <EditorActions />
    </Form>
  );
}
