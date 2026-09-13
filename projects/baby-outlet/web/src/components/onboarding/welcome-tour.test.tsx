import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { makeResource } from "@baby-outlet/backend/convex/test.resource";
import * as React from "react";

vi.mock("@workspace/ui/components/carousel", () => {
  type Api = {
    selectedScrollSnap: () => number;
    scrollTo: (index: number) => void;
    scrollNext: () => void;
    on: (event: string, cb: () => void) => void;
    off: (event: string, cb: () => void) => void;
  };

  function Carousel(props: {
    setApi: ((api: Api) => void) | undefined;
    children: React.ReactNode | undefined;
  }) {
    const indexRef = React.useRef(0);
    const listeners = React.useRef(new Set<() => void>());

    React.useEffect(() => {
      const notify = () => {
        for (const listener of listeners.current) listener();
      };
      const api: Api = {
        selectedScrollSnap: () => indexRef.current,
        scrollTo: (next) => {
          indexRef.current = next;
          notify();
        },
        scrollNext: () => {
          indexRef.current += 1;
          notify();
        },
        on: (_event, cb) => {
          listeners.current.add(cb);
        },
        off: (_event, cb) => {
          listeners.current.delete(cb);
        },
      };
      props.setApi?.(api);
    }, [props.setApi]);

    return <div>{props.children}</div>;
  }

  return {
    Carousel,
    CarouselContent: (props: { children: React.ReactNode | undefined }) => (
      <div>{props.children}</div>
    ),
    CarouselItem: (props: { children: React.ReactNode | undefined }) => <div>{props.children}</div>,
  };
});

const { WelcomeTourDialog } = await import("./welcome-tour");

function renderResource(ui: React.ReactElement) {
  const view = render(ui);
  return makeResource(view, () => {
    view.unmount();
  });
}

test("welcome tour renders overview slides and can be skipped", async () => {
  const onFinished = vi.fn<() => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();

  await using _view = renderResource(
    <WelcomeTourDialog open onOpenChange={onOpenChange} onFinished={onFinished} />,
  );

  expect(screen.getByText(/welcome! here's the idea/i)).toBeTruthy();
  expect(screen.getByText(/create a baby page/i)).toBeTruthy();
  expect(screen.getByText(/choose a journey/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: /^next$/i })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
  expect(onFinished).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test("welcome tour finishes with Let's go on the last slide", async () => {
  const onFinished = vi.fn<() => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();

  await using _view = renderResource(
    <WelcomeTourDialog open onOpenChange={onOpenChange} onFinished={onFinished} />,
  );

  fireEvent.click(screen.getByRole("button", { name: /go to slide 4/i }));

  await vi.waitFor(() => {
    expect(screen.getByRole("button", { name: /let's go/i })).toBeTruthy();
  });

  fireEvent.click(screen.getByRole("button", { name: /let's go/i }));
  expect(onFinished).toHaveBeenCalledOnce();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
