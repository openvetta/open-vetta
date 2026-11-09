// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { StepSlider } from "./step-slider";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

async function mount(props: Partial<Parameters<typeof StepSlider>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const onIndexCommit = vi.fn();
  const root = createRoot(host);
  await act(async () => {
    root.render(<StepSlider labels={["a", "b", "c"]} index={1} onIndexCommit={onIndexCommit} {...props} />);
  });
  return { host, onIndexCommit };
}

describe("StepSlider", () => {
  test("clicking a step label commits that step and marks the current one pressed", async () => {
    const { host, onIndexCommit } = await mount();
    const buttons = Array.from(host.querySelectorAll("button"));

    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    await act(async () => buttons[2]?.click());

    expect(onIndexCommit).toHaveBeenCalledWith(2);
  });

  test("draws ticks only on interior steps that are not under the thumb, and only when asked", async () => {
    const plain = await mount();
    expect(plain.host.querySelectorAll("[aria-hidden] > span")).toHaveLength(0);

    document.body.replaceChildren();
    const ticked = await mount({ showTicks: true, labels: ["a", "b", "c", "d", "e"], index: 2 });
    expect(ticked.host.querySelectorAll("[aria-hidden] > span")).toHaveLength(2);
  });

  test("fullWidth pins the first label to the left edge and the last to the right edge", async () => {
    const { host } = await mount({ fullWidth: true });
    const [first, middle, last] = Array.from(host.querySelectorAll("button"));

    expect(first?.style.left).toBe("0%");
    expect(middle?.style.left).toBe("50%");
    expect(last?.style.left).toBe("100%");
    expect(last?.style.transform).toBe("translateX(-100%)");
  });
});
