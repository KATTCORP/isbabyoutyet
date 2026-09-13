import { PasswordResetEmail } from "../src/password-reset";
import type { PasswordResetEmailProps } from "../src/password-reset";

export default function PasswordResetPreview(props: PasswordResetEmailProps) {
  return <PasswordResetEmail resetUrl={props.resetUrl} subjectPrefix={props.subjectPrefix} />;
}

PasswordResetPreview.PreviewProps = {
  resetUrl: "https://isbabyoutyet.com/auth/reset-password?token=preview",
  subjectPrefix: "",
};
