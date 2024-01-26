import * as resvg from "@resvg/resvg-wasm";

export class OneShotRenderer {
  private fontBuffers: Uint8Array[] = [];

  async initialize() {
    await resvg.initWasm(
      fetch("https://unpkg.com/@resvg/resvg-wasm/index_bg.wasm")
    );

    const font = await fetch(
      "https://shama.dxrating.net/fonts/Torus-Regular.woff2"
    );
    if (!font.ok) return;

    const fontData = await font.arrayBuffer();
    this.fontBuffers = [new Uint8Array(fontData)];
  }

  async render(svg: string) {
    const opts = {
      fitTo: {
        mode: "original", // If you need to change the size
      },
      font: {
        fontBuffers: this.fontBuffers,
      },
    } satisfies resvg.ResvgRenderOptions;

    const resvgJS = new resvg.Resvg(svg, opts);
    const pngData = resvgJS.render();
    const pngBuffer = pngData.asPng();
    const svgURL = URL.createObjectURL(
      new Blob([pngBuffer], { type: "image/png" })
    );
    return svgURL;
  }
}
