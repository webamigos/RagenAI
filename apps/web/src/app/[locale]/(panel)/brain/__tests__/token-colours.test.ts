import { afterEach, describe, expect, it, vi } from 'vitest';

const { tokenColours } = await import('../components/BrainGraphCanvas');

/**
 * jsdom has no canvas, so this one composites like a browser does: each
 * fill is drawn over the pixel below it by its own alpha and `globalAlpha`.
 * Enough to show which colour a token is read back as.
 */
function fakeContext() {
  let pixel = [0, 0, 0, 0];
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect: () => {
      pixel = [0, 0, 0, 0];
    },
    fillRect: () => {
      const [r, g, b, a = 1] = ctx.fillStyle
        .replace(/rgba?\(|\)/g, '')
        .split(',')
        .map(Number);
      const alpha = a * ctx.globalAlpha;
      const under = pixel[3]! / 255;
      const out = alpha + under * (1 - alpha);
      const mix = (top: number, below: number) =>
        out === 0
          ? 0
          : Math.round((top * alpha + below * under * (1 - alpha)) / out);
      pixel = [
        mix(r!, pixel[0]!),
        mix(g!, pixel[1]!),
        mix(b!, pixel[2]!),
        Math.round(out * 255),
      ];
    },
    getImageData: () => ({ data: pixel }),
  };
  return ctx;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('tokenColours', () => {
  it('reads a translucent token as it looks over the background, not as its opaque self', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => fakeContext() as never,
    );
    const el = document.createElement('div');
    // Dark mode: the border is white at 10% over a near-black ground.
    el.style.setProperty('--background', 'rgb(10,10,20)');
    el.style.setProperty('--border', 'rgba(255,255,255,0.1)');
    document.body.append(el);

    const dim = tokenColours(el).dim;

    // Close to the background, and nowhere near the white it was read as.
    const [r, g, b] = dim.match(/\d+/g)!.map(Number);
    expect(r).toBeLessThan(40);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(50);
    el.remove();
  });
});
