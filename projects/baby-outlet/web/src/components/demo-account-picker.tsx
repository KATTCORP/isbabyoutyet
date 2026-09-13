import { DEMO_ACCOUNTS } from "@baby-outlet/backend/src/seedCredentials";
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select";
import { Label } from "@workspace/ui/components/label";

/**
 * Preview/local-only picker of seeded test accounts. The parent prefills and
 * submits the auth form. Pass `enabled` from `hasDemoLogin` at the call site.
 */
export function DemoAccountPicker(props: {
  enabled: boolean;
  onPrefill: (account: (typeof DEMO_ACCOUNTS)[number]) => void;
}) {
  if (!props.enabled) {
    return null;
  }

  return (
    <div className="mb-5 flex flex-col gap-1.5 rounded-2xl border-2 border-dashed border-border bg-muted/40 p-3">
      <Label className="text-xs font-extrabold text-muted-foreground" htmlFor="demo-account-picker">
        Test account
      </Label>
      <NativeSelect
        className="w-full"
        defaultValue=""
        id="demo-account-picker"
        onChange={(event) => {
          const account = DEMO_ACCOUNTS.find((item) => item.email === event.currentTarget.value);
          if (!account) {
            return;
          }
          props.onPrefill(account);
        }}
      >
        <NativeSelectOption disabled value="">
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
