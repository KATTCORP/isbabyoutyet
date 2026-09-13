import { ActionEmail } from "./action-email";
import { passwordResetCopy } from "./copy";

export type PasswordResetEmailProps = {
  resetUrl: string;
  subjectPrefix: string;
};

export function PasswordResetEmail(props: PasswordResetEmailProps) {
  return (
    <ActionEmail
      button={passwordResetCopy.button}
      heading={passwordResetCopy.heading}
      ignore={passwordResetCopy.ignore}
      intro={passwordResetCopy.intro}
      previewText={passwordResetCopy.previewText}
      subjectPrefix={props.subjectPrefix}
      url={props.resetUrl}
    />
  );
}
