import fs from 'node:fs';
import { BrowserQRCodeSvgWriter } from '../node_modules/html5-qrcode/third_party/zxing-js.umd.js';

class SvgNode {
  constructor(tagName) {
    this.tagName = tagName;
    this.attrs = {};
    this.children = [];
  }

  setAttributeNS(_ns, key, value) {
    this.attrs[key] = String(value);
  }

  appendChild(child) {
    this.children.push(child);
  }

  get outerHTML() {
    const attrs = Object.entries(this.attrs)
      .map(([key, value]) => ` ${key}=${JSON.stringify(value)}`)
      .join('');
    const children = this.children.map(child => child.outerHTML || '').join('');
    return `<${this.tagName}${attrs}>${children}</${this.tagName}>`;
  }
}

globalThis.document = {
  createElementNS(_ns, tagName) {
    return new SvgNode(tagName);
  },
};
globalThis.window = {};

const writer = new BrowserQRCodeSvgWriter();
const svgEl = writer.write('https://bunq.me/JoepWillemsen', 360, 360);
svgEl.setAttributeNS(null, 'viewBox', '0 0 360 360');
svgEl.setAttributeNS(null, 'xmlns', 'http://www.w3.org/2000/svg');

const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${svgEl.outerHTML}\n`;
fs.writeFileSync(new URL('../public/bunq-qr.svg', import.meta.url), svg);

console.log('written public/bunq-qr.svg');
