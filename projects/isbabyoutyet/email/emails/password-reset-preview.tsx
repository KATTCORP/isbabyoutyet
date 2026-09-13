import { PasswordResetEmail } from "../src/password-reset";
import type { PasswordResetEmailProps } from "../src/password-reset";

export default function PasswordResetPreviewDeployment(props: PasswordResetEmailProps) {
  return <PasswordResetEmail resetUrl={props.resetUrl} subjectPrefix={props.subjectPrefix} />;
}

PasswordResetPreviewDeployment.PreviewProps = {
  resetUrl: "https://preview.example/auth/reset-password?token=preview",
  subjectPrefix: "[Preview] ",
};
