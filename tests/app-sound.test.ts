// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";

const reactActEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

class MockAudio {
  static instances: MockAudio[] = [];

  src: string;
  preload = "";
  currentTime = 0;
  pause = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);

  constructor(src: string) {
    this.src = src;
    MockAudio.instances.push(this);
  }
}

function getSquareButton(container: HTMLElement, square: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    `button[aria-label^="Square ${square}"]`,
  );
  if (!button) {
    throw new Error(`Missing square button for ${square}`);
  }
  return button;
}

describe("App move sound", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    MockAudio.instances = [];
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("Audio", MockAudio);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }

    container.remove();
    root = null;
    reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
    vi.unstubAllGlobals();
  });

  it("plays the move sound after a successful player move", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(React.createElement(App));
    });

    await act(async () => {
      getSquareButton(container, "e2").click();
    });

    expect(MockAudio.instances).toHaveLength(0);

    await act(async () => {
      getSquareButton(container, "e4").click();
    });

    expect(MockAudio.instances).toHaveLength(1);
    expect(MockAudio.instances[0].src).toBe("/sounds/chess-move.mp3");
    expect(MockAudio.instances[0].play).toHaveBeenCalledTimes(1);
  });
});
