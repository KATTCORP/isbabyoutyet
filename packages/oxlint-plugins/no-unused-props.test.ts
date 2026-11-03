import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./workspace.ts";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

function unused(component: string, prop: string) {
  return { messageId: "unused", data: { component, prop } };
}

tester.run("no-unused-props", plugin.rules["no-unused-props"], {
  valid: [
    // Member reads, including calls, optional chains, and string-literal access.
    `type Props = { title: string; onSave: () => void; baby: { name: string } | null };
     function Card(props: Props) {
       return <button onClick={() => props.onSave()}>{props.title}{props.baby?.name}</button>;
     }`,
    `type Props = { "aria-label": string };
     function Card(props: Props) {
       return <div aria-label={props["aria-label"]} />;
     }`,
    // Reads inside nested callbacks and child closures.
    `type Props = { items: Array<string>; onPick: (item: string) => void };
     function List(props: Props) {
       return <ul>{props.items.map((item) => <li onClick={() => props.onPick(item)}>{item}</li>)}</ul>;
     }`,
    // Forwarding `props` whole uses every key.
    `type Props = { a: string; b: string };
     function Outer(props: Props) {
       return <Inner {...props} />;
     }`,
    `type Props = { a: string; b: string };
     function Outer(props: Props) {
       return <Inner value={props} />;
     }`,
    `type Props = { enabled: boolean; publicId: string };
     function Harness(props: Props) {
       useDemoToast(props);
       return <Toaster />;
     }`,
    `type Props = { a: string; b: string };
     function Outer(props: Props) {
       return <div>{format(props)}</div>;
     }`,
    `type Props = { a: string; b: string };
     function Outer(props: Props) {
       const view = { ...props, extra: 1 };
       return <Inner view={view} />;
     }`,
    `type Props = { a: string; b: string };
     function Outer(props: Props) {
       const alias = props;
       return <div>{alias.a}</div>;
     }`,
    // Destructuring in the body, with defaults and rest.
    `type Props = { a: string; b: string; c: string };
     function Outer(props: Props) {
       const { a, b = "fallback" } = props;
       return <div title={props.c}>{a}{b}</div>;
     }`,
    `type Props = { a: string; b: string; c: string };
     function Outer(props: Props) {
       const { a, ...rest } = props;
       return <Inner a={a} {...rest} />;
     }`,
    // Computed access may read any key.
    `type Props = { a: string; b: string };
     function Outer(props: Props) {
       const key = pick();
       return <div>{props[key]}</div>;
     }`,
    // JSX member tags.
    `type Props = { Icon: () => null; label: string };
     function Badge(props: Props) {
       return <span><props.Icon />{props.label}</span>;
     }`,
    // Interfaces, inline literals, intersections, and arrow components.
    `interface Props { title: string }
     export const Card = (props: Props) => <h1>{props.title}</h1>;`,
    `export function Card(props: { title: string }) {
       return <h1>{props.title}</h1>;
     }`,
    `type Base = { a: string };
     interface Extended extends Base { b: string }
     function Card(props: Extended & { c: string }) {
       return <p>{props.a}{props.b}{props.c}</p>;
     }`,
    // Wrapped components.
    `type Props = { title: string };
     export const Card = memo(function Card(props: Props) {
       return <h1>{props.title}</h1>;
     });`,
    `type Props = { title: string };
     export const Card = React.forwardRef((props: Props, ref: Ref<HTMLHeadingElement>) => (
       <h1 ref={ref}>{props.title}</h1>
     ));`,
    // Not statically resolvable: imported, generic, utility, and union types.
    `import type { CardProps } from "./card";
     function Card(props: CardProps) {
       return <h1>{props.title}</h1>;
     }`,
    `function Card<TProps extends { a: string; b: string }>(props: TProps) {
       return <h1>{props.a}</h1>;
     }`,
    `type Props<TItem> = { item: TItem; unused: string };
     function Card(props: Props<string>) {
       return <h1>{props.item}</h1>;
     }`,
    `type Props = { a: string; b: string };
     function Card(props: Omit<Props, "b">) {
       return <h1>{props.a}</h1>;
     }`,
    `type Props = { kind: "a"; a: string } | { kind: "b"; b: string };
     function Card(props: Props) {
       return <h1>{props.kind}</h1>;
     }`,
    // A type parameter shadows a module-level type of the same name.
    `type TProps = { a: string; b: string };
     function Card<TProps extends { a: string }>(props: TProps) {
       return <h1>{props.a}</h1>;
     }`,
    // Merged interface declarations are skipped.
    `interface Props { a: string }
     interface Props { b: string }
     function Card(props: Props) {
       return <h1>{props.a}</h1>;
     }`,
    // Not components: lowercase name, no JSX, untyped or destructured param, `_` prefix.
    `type Props = { a: string; b: string };
     function useCard(props: Props) {
       return props.a;
     }`,
    `type Props = { a: string; b: string };
     function renderCard(props: Props) {
       return <h1>{props.a}</h1>;
     }`,
    `type Options = { a: string; b: string };
     function Schema(options: Options) {
       return options.a;
     }`,
    `function Card(props) {
       return <h1>{props.a}</h1>;
     }`,
    `type Props = { a: string; b: string };
     function Card(_props: Props) {
       return <h1 />;
     }`,
    // Self-referencing aliases do not loop.
    `type Node = { child: Node; label: string };
     function Tree(props: Node) {
       return <div>{props.label}{props.child.label}</div>;
     }`,
  ],
  invalid: [
    {
      code: `type Props = { used: string; unused: number };
        function Card(props: Props) {
          return <div>{props.used}</div>;
        }`,
      errors: [unused("Card", "unused")],
    },
    {
      code: `interface Props { title: string; ghost: string; onGhost(): void }
        export const Card = (props: Props) => <h1>{props.title}</h1>;`,
      errors: [unused("Card", "ghost"), unused("Card", "onGhost")],
    },
    {
      code: `export function Card(props: { inline: string; "inline-dead": string }) {
          return <p>{props.inline}</p>;
        }`,
      errors: [unused("Card", "inline-dead")],
    },
    {
      code: `type Base = { base: string; baseDead: string };
        type Props = Base & { extra: string };
        function Card(props: Props) {
          return <p>{props.base}{props.extra}</p>;
        }`,
      errors: [unused("Card", "baseDead")],
    },
    {
      code: `interface Base { inherited: string }
        interface Props extends Base { own: string }
        function Card(props: Props) {
          return <p>{props.own}</p>;
        }`,
      errors: [unused("Card", "inherited")],
    },
    {
      // Unresolvable intersection members are skipped; local ones are checked.
      code: `import type { ComponentProps } from "react";
        type Props = Omit<ComponentProps<"button">, "type"> & { loading: boolean };
        function SubmitButton(props: Props) {
          return <button type="submit" />;
        }`,
      errors: [unused("SubmitButton", "loading")],
    },
    {
      code: `type Props = { a: string; b: string; c: string };
        function Card(props: Props) {
          const { a } = props;
          return <p title={props["b"]}>{a}</p>;
        }`,
      errors: [unused("Card", "c")],
    },
    {
      // A shared type is checked per component.
      code: `type Props = { enabled: boolean; surface: string };
        export function Host(props: Props) {
          if (!props.enabled) {
            return null;
          }
          return <HostAuthed {...props} />;
        }
        function HostAuthed(props: Props) {
          return <div>{props.surface}</div>;
        }`,
      errors: [unused("HostAuthed", "enabled")],
    },
    {
      code: `type Props = { title: string; children: ReactNode };
        function Section(props: Props) {
          return <section>{props.children}</section>;
        }`,
      errors: [unused("Section", "title")],
    },
    {
      code: `type Props = { title: string; dead: string };
        export const Card = memo(function Card(props: Props) {
          return <h1>{props.title}</h1>;
        });`,
      errors: [unused("Card", "dead")],
    },
    {
      code: `type Props = { title: string; dead: string };
        export const Card = forwardRef((props: Props, ref: Ref<HTMLHeadingElement>) => (
          <h1 ref={ref}>{props.title}</h1>
        ));`,
      errors: [unused("Card", "dead")],
    },
    {
      // A shadowing inner `props` does not count as a read of the outer one.
      code: `type Props = { title: string; dead: string };
        function Card(props: Props) {
          const render = (props: { dead: string }) => props.dead;
          return <h1>{props.title}{render({ dead: "x" })}</h1>;
        }`,
      errors: [unused("Card", "dead")],
    },
    {
      code: `type Props = { title: string };
        function Card(props: Props) {
          return <h1 />;
        }`,
      errors: [unused("Card", "title")],
    },
    {
      code: `type Props = { title: string; dead: string };
        export default function Card(props: Props) {
          return <><h1>{props.title}</h1></>;
        }`,
      errors: [unused("Card", "dead")],
    },
  ],
});
