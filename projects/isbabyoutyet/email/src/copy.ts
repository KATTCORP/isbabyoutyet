/** Copy every email shares. */
export type EmailBrandCopy = {
  ignore: string;
  previewBanner: string;
  wordmark: string;
};

/** Copy for an email whose one action is a button. */
export type ActionEmailCopy = EmailBrandCopy & {
  button: string;
  heading: string;
  intro: string;
  previewText: string;
  subject: string;
};

export const emailBrandCopy = {
  ignore: "If you did not request this, you can safely ignore this email.",
  previewBanner: "Preview deployment. This message is not from production.",
  wordmark: "isbabyoutyet",
} as const satisfies EmailBrandCopy;

export const passwordResetCopy = {
  button: "Reset your password",
  heading: "Reset your password",
  ignore: emailBrandCopy.ignore,
  intro: "Someone requested a password reset for your Is Baby Out Yet? account.",
  previewBanner: emailBrandCopy.previewBanner,
  previewText: "Reset your Is Baby Out Yet? password",
  subject: "Reset your Is Baby Out Yet? password",
  wordmark: emailBrandCopy.wordmark,
} as const satisfies ActionEmailCopy;
