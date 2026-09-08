/**
 * Pure marketing markup for the homepage RSC tree. No hooks, no event
 * handlers, no router Links — safe inside `createCompositeComponent`.
 */

import type { SVGProps } from "react";

export type HomepageFeatureCard = {
  description: string;
  emoji: string;
  title: string;
};

export type HomepageHowItWorksStep = {
  description: string;
  step: string;
  title: string;
};

export function HomepageBrandMark() {
  return (
    <span className="flex items-center gap-2 rounded-full border-2 border-border bg-background/85 py-1.5 pl-2 pr-4 backdrop-blur-md shadow-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15">
        <span aria-hidden="true" className="text-sm font-black text-primary">
          👶
        </span>
      </span>
      <span className="text-sm font-extrabold tracking-tight">isbabyoutyet</span>
    </span>
  );
}

export function HomepageFeaturesSection(props: {
  features: ReadonlyArray<HomepageFeatureCard>;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="py-12">
      <div className="text-center">
        <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
          {props.title}
        </h2>
        <p className="mt-2 font-semibold text-muted-foreground">{props.subtitle}</p>
      </div>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {props.features.map((feature, index) => (
          <div
            className={`rounded-3xl border-2 border-border bg-card p-6 pop-shadow transition-transform hover:-translate-y-1 ${
              index % 2 === 0 ? "hover:-rotate-1" : "hover:rotate-1"
            }`}
            key={feature.title}
          >
            <span aria-hidden="true" className="text-3xl">
              {feature.emoji}
            </span>
            <h3 className="mt-3 text-lg font-extrabold text-foreground">{feature.title}</h3>
            <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomepageHowItWorksSection(props: {
  steps: ReadonlyArray<HomepageHowItWorksStep>;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="py-12">
      <div className="text-center">
        <h2 className="text-3xl font-black tracking-tight text-foreground md:text-4xl">
          {props.title}
        </h2>
        <p className="mt-2 font-semibold text-muted-foreground">{props.subtitle}</p>
      </div>
      <div className="mt-10 grid gap-8 md:grid-cols-3">
        {props.steps.map((item) => (
          <div className="flex flex-col items-center text-center" key={item.step}>
            <div className="flex h-14 w-14 -rotate-3 items-center justify-center rounded-2xl border-2 border-primary/30 bg-primary/15 text-2xl font-black text-primary pop-shadow">
              {item.step}
            </div>
            <h3 className="mt-4 text-lg font-extrabold text-foreground">{item.title}</h3>
            <p className="mt-1.5 font-medium leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HomepageGithubLink(props: { label: string }) {
  return (
    <a
      className="inline-flex items-center gap-2 font-bold text-muted-foreground transition-colors hover:text-foreground"
      href="https://github.com/KATT/isbabyoutyet"
      rel="noopener noreferrer"
      target="_blank"
    >
      <GithubIcon className="h-5 w-5" />
      <span>{props.label}</span>
    </a>
  );
}

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24" {...props}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}
