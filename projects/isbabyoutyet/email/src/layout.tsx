import type { ReactNode } from "react";
import { Body, Container, Head, Html, Preview, Section, Tailwind, Text } from "react-email";
import { emailBrandCopy } from "./copy";
import { emailTailwindConfig } from "./theme";

export type EmailLayoutProps = {
  children: ReactNode;
  previewText: string;
  showPreviewBanner: boolean;
};

export function EmailLayout(props: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Tailwind config={emailTailwindConfig}>
        <Head />
        <Preview>{props.previewText}</Preview>
        <Body className="m-0 bg-background px-4 py-8 font-sans">
          {props.showPreviewBanner ? (
            <Section className="mx-auto mb-6 max-w-email rounded-pill bg-accent px-4 py-2">
              <Text className="m-0 text-center text-[13px] font-extrabold text-foreground">
                {emailBrandCopy.previewBanner}
              </Text>
            </Section>
          ) : null}
          <Container className="mx-auto max-w-email">
            <Section className="mb-6 text-center">
              <Text className="m-0 inline-block rounded-pill border-2 border-solid border-border bg-card py-1.5 pr-4 pl-2 text-sm font-extrabold tracking-tight text-foreground">
                <span className="mr-2 inline-block w-7 rounded-pill bg-primary-soft text-center text-sm leading-7 text-primary">
                  👶
                </span>
                {emailBrandCopy.wordmark}
              </Text>
            </Section>
            {props.children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
