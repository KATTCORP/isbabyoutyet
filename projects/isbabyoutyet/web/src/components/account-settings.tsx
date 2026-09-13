import { CheckIcon, EnvelopeSimpleIcon, KeyIcon, UserIcon } from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "@isbabyoutyet/backend/convex/_generated/api";
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

export type AccountUser = {
  email: string;
  name: string;
};

type AccountSessionSnapshot = {
  data: { user: AccountUser } | null;
};

export type AccountAuthResult = {
  errorMessage: string | null;
};

/**
 * @internal Exported for tests; production wires it in `AccountSettings`.
 */
export async function completeAccountAuthAction(
  result: AccountAuthResult,
  opts: { failedMessage: string; onSuccess: () => Promise<void> },
) {
  if (result.errorMessage !== null) {
    throw new Error(result.errorMessage || opts.failedMessage);
  }
  await opts.onSuccess();
}

/**
 * Maps a Better Auth user (or logged-out `null`) onto the account section's
 * session snapshot.
 *
 * @internal
 */
export function accountSessionSnapshot(
  user: { email: string; name: string } | null,
): AccountSessionSnapshot {
  if (user === null) {
    return { data: null };
  }
  return {
    data: {
      user: {
        email: user.email,
        name: user.name,
      },
    },
  };
}

async function defaultChangeEmail(body: {
  newEmail: string;
  persist: (args: { newEmail: string }) => Promise<null>;
}) {
  try {
    await body.persist({ newEmail: body.newEmail });
    return { error: null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : "" } };
  }
}

/**
 * Mutable auth adapters so sheet tests can swap the network-backed
 * better-auth client without `vi.mock`.
 *
 * @internal
 */
export const accountAuthAdapter = {
  changeEmail: defaultChangeEmail,
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: true;
  }) => authClient.changePassword(body),
  updateUser: (body: { name: string }) => authClient.updateUser(body),
};

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
 * Convex-wired account rows for the dashboard settings sheet.
 */
export function AccountSettings(props: { profile: PreloadedConvexQuery<typeof api.profile.get> }) {
  const { t } = useI18n();
  const changeAccountEmail = useMutation(api.accountEmail.change);
  const profileQuery = usePreloadedConvexQuery(api.profile.get, props.profile);
  const profile = profileQuery.data;

  const sessionUser =
    profile === null || profile === undefined
      ? null
      : {
          email: profile.email,
          name: profile.name,
        };

  return (
    <AccountSettingsView
      onChangeEmail={
        sessionUser
          ? async (values) => {
              const result = await accountAuthAdapter.changeEmail({
                newEmail: values.newEmail,
                persist: async (args) => {
                  await changeAccountEmail(args);
                  return null;
                },
              });
              await completeAccountAuthAction(
                { errorMessage: result.error ? (result.error.message ?? "") : null },
                {
                  failedMessage: t("Unable to change your email"),
                  onSuccess: async () => {
                    toast.success(t("Your email has been updated."));
                  },
                },
              );
            }
          : null
      }
      onChangePassword={
        sessionUser
          ? async (values) => {
              const result = await accountAuthAdapter.changePassword({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
                revokeOtherSessions: true,
              });
              await completeAccountAuthAction(
                { errorMessage: result.error ? (result.error.message ?? "") : null },
                {
                  failedMessage: t("Unable to update your password"),
                  onSuccess: async () => {
                    toast.success(t("Your password has been updated."));
                  },
                },
              );
            }
          : null
      }
      onUpdateName={
        sessionUser
          ? async (values) => {
              const result = await accountAuthAdapter.updateUser({
                name: values.name,
              });
              await completeAccountAuthAction(
                { errorMessage: result.error ? (result.error.message ?? "") : null },
                {
                  failedMessage: t("Unable to update your name"),
                  onSuccess: async () => {
                    toast.success(t("Your name has been updated."));
                  },
                },
              );
            }
          : null
      }
      user={sessionUser}
    />
  );
}

export type AccountSettingsHandlers = {
  onChangeEmail: (values: { newEmail: string }) => Promise<void>;
  onChangePassword: (values: {
    confirmPassword: string;
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  onUpdateName: (values: { name: string }) => Promise<void>;
};

/**
 * Presentational account rows. Auth arrives as props so tests can drive
 * submit without mocking the better-auth client.
 */
export function AccountSettingsView(props: {
  onChangeEmail: AccountSettingsHandlers["onChangeEmail"] | null;
  onChangePassword: AccountSettingsHandlers["onChangePassword"] | null;
  onUpdateName: AccountSettingsHandlers["onUpdateName"] | null;
  user: AccountUser | null;
}) {
  const { t } = useI18n();

  if (props.user === null) {
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
          <ItemDescription>{props.user.name}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {props.onUpdateName === null ? null : (
            <NameEditor name={props.user.name} onUpdateName={props.onUpdateName} />
          )}
        </ItemActions>
      </Item>

      <ItemSeparator />

      <Item>
        <ItemMedia variant="icon">
          <EnvelopeSimpleIcon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{t("Email")}</ItemTitle>
          <ItemDescription>{props.user.email}</ItemDescription>
        </ItemContent>
        <ItemActions>
          {props.onChangeEmail === null ? null : (
            <EmailEditor email={props.user.email} onChangeEmail={props.onChangeEmail} />
          )}
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
          {props.onChangePassword === null ? null : (
            <PasswordEditor onChangePassword={props.onChangePassword} />
          )}
        </ItemActions>
      </Item>
    </>
  );
}

function NameEditor(props: {
  name: string;
  onUpdateName: AccountSettingsHandlers["onUpdateName"];
}) {
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
          <NameForm name={props.name} onClose={overlay.close} onUpdateName={props.onUpdateName} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function NameForm(props: {
  name: string;
  onClose: () => void;
  onUpdateName: AccountSettingsHandlers["onUpdateName"];
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: { name: props.name },
    schema: nameSchema(t),
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onUpdateName(values);
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

function EmailEditor(props: {
  email: string;
  onChangeEmail: AccountSettingsHandlers["onChangeEmail"];
}) {
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
          <EmailForm
            email={props.email}
            onChangeEmail={props.onChangeEmail}
            onClose={overlay.close}
          />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function EmailForm(props: {
  email: string;
  onChangeEmail: AccountSettingsHandlers["onChangeEmail"];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const form = useZodForm({
    defaultValues: { newEmail: props.email },
    schema: changeEmailSchema(t, props.email),
  });

  return (
    <Form
      form={form}
      handleSubmit={async (values) => {
        await props.onChangeEmail(values);
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

function PasswordEditor(props: { onChangePassword: AccountSettingsHandlers["onChangePassword"] }) {
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
          <PasswordForm onChangePassword={props.onChangePassword} onClose={overlay.close} />
        </FormGuardProvider>
      </PopoverContent>
    </Popover>
  );
}

function PasswordForm(props: {
  onChangePassword: AccountSettingsHandlers["onChangePassword"];
  onClose: () => void;
}) {
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
        await props.onChangePassword(values);
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
