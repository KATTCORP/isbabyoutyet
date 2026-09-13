import { Button, Section, Text } from "react-email";
import { EmailLayout } from "./layout";
import { emailTheme } from "./theme";

export type ActionEmailProps = {
  button: string;
  heading: string;
  ignore: string;
  intro: string;
  previewText: string;
  subjectPrefix: string;
  url: string;
};

export function ActionEmail(props: ActionEmailProps) {
  return (
    <EmailLayout previewText={props.previewText} showPreviewBanner={props.subjectPrefix !== ""}>
      <Section
        className="rounded-card border-2 border-solid border-border bg-card px-6 py-8"
        style={{ boxShadow: emailTheme.popShadow }}
      >
        <Text className="mt-0 mb-2 text-center text-4xl leading-10">✉️</Text>
        <Text className="mt-0 mb-3 text-center text-2xl leading-8 font-black text-foreground">
          {props.heading}
        </Text>
        <Text className="mt-0 mb-6 text-center text-base leading-6 font-medium text-muted">
          {props.intro}
        </Text>
        {/*
          React Email's Button defaults to max-width: 100%. Email clients treat
          that as content-box, so padding plus the 6px pop-shadow overflows the
          card. Override the max-width and size the CTA to its label.

          Tailwind's `shadow-*` utilities emit `--tw-shadow-color`, which most
          email clients strip. Keep the pop-shadow as a raw box-shadow value.
        */}
        <Text className="m-0 text-center">
          <Button
            className="inline-block w-auto max-w-none rounded-pill bg-primary px-6 py-[14px] text-center text-base leading-6 font-extrabold text-primary-foreground no-underline"
            href={props.url}
            style={{
              boxShadow: emailTheme.popShadow,
              maxWidth: "none",
              width: "auto",
            }}
          >
            {props.button}
          </Button>
        </Text>
        <Text className="mt-6 mb-0 text-center text-sm leading-[22px] text-muted">
          {props.ignore}
        </Text>
      </Section>
    </EmailLayout>
  );
}
