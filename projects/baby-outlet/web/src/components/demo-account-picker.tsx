import { DEMO_ACCOUNTS } from "@baby-outlet/backend/src/seedCredentials";
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select";
import { Label } from "@workspace/ui/components/label";
import { hasDemoLogin } from "@/lib/has-demo-login";

/**
 * Preview/local-only picker of seeded test accounts. The parent prefills and
 * submits the auth form.
 */
export function DemoAccountPicker(props: {
  onPrefill: (account: (typeof DEMO_ACCOUNTS)[number]) => void;
}) {
  if (!hasDemoLogin) return null;

  return (
    <div className="mb-5 flex flex-col gap-1.5 rounded-2xl border-2 border-dashed border-border bg-muted/40 p-3">
      <Label htmlFor="demo-account-picker" className="text-xs font-extrabold text-muted-foreground">
        Test account
      </Label>
      <NativeSelect
        id="demo-account-picker"
        className="w-full"
        defaultValue=""
        onChange={(event) => {
          const account = DEMO_ACCOUNTS.find((item) => item.email === event.currentTarget.value);
          if (!account) return;
          props.onPrefill(account);
        }}
      >
        <NativeSelectOption value="" disabled>
          Choose a test account…
        </NativeSelectOption>
        {DEMO_ACCOUNTS.map((account) => (
          <NativeSelectOption key={account.email} value={account.email}>
            {account.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
