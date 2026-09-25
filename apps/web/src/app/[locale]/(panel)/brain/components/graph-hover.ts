/**
 * The label box Sigma draws for a hovered or picked page, in the panel's
 * colours.
 *
 * Sigma's own (`drawDiscNodeHover`) paints the box `#FFF` and the text in
 * `labelColor` — which is the foreground token, near-white in dark mode, so
 * the name of the page you had just clicked was white on white. This is the
 * same shape, filled with the card colour and outlined, with the text in the
 * foreground: readable in both themes because both come from the theme.
 */
type HoverData = {
  x: number;
  y: number;
  size: number;
  label?: string | null;
};

type HoverSettings = {
  labelSize: number;
  labelFont: string;
  labelWeight: string;
};

export function makeDrawNodeHover(colours: {
  surface: string;
  border: string;
  text: string;
}) {
  return function drawNodeHover(
    context: CanvasRenderingContext2D,
    data: HoverData,
    settings: HoverSettings,
  ): void {
    const size = settings.labelSize;
    const padding = 3;
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    context.fillStyle = colours.surface;
    context.strokeStyle = colours.border;
    context.lineWidth = 1;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 1;
    context.shadowBlur = 6;
    context.shadowColor = 'rgba(0,0,0,0.35)';

    const radius = Math.max(data.size, size / 2) + padding;
    context.beginPath();
    if (typeof data.label === 'string' && data.label) {
      const boxWidth = Math.round(context.measureText(data.label).width + 8);
      const boxHeight = Math.round(size + 2 * padding);
      const angle = Math.asin(Math.min(1, boxHeight / 2 / radius));
      const dx = Math.sqrt(Math.abs(radius ** 2 - (boxHeight / 2) ** 2));
      context.moveTo(data.x + dx, data.y + boxHeight / 2);
      context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
      context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
      context.lineTo(data.x + dx, data.y - boxHeight / 2);
      context.arc(data.x, data.y, radius, angle, -angle);
    } else {
      context.arc(data.x, data.y, radius, 0, Math.PI * 2);
    }
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.stroke();

    if (typeof data.label === 'string' && data.label) {
      context.fillStyle = colours.text;
      context.fillText(data.label, data.x + data.size + 4, data.y + size / 3);
    }
  };
}
