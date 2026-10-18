/** Black or white, whichever reads better on the given accent colour. Moved out of features/music in P3-3. */
export function getAccentInk(accent: string): '#000000' | '#ffffff' {
  const color = /^#[a-f0-9]{6}$/i.test(accent) ? accent : '#10b981';
  const linear = (hex: string) => {
    const value = parseInt(hex, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = .2126 * linear(color.slice(1, 3)) + .7152 * linear(color.slice(3, 5)) + .0722 * linear(color.slice(5, 7));
  return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
