import type { Cost, ResourceKey } from '../core/types';
import { iconUrl, type IconName } from '../render/sprites';

type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  disabled?: boolean;
  onclick?: (e: MouseEvent) => void;
  attrs?: Record<string, string>;
  style?: string;
}

/** Tiny DOM builder. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.title) el.title = props.title;
  if (props.style) el.setAttribute('style', props.style);
  if (props.disabled !== undefined && 'disabled' in el) (el as HTMLButtonElement).disabled = props.disabled;
  if (props.onclick) el.addEventListener('click', props.onclick as EventListener);
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function icon(name: IconName, size = 16): HTMLImageElement {
  const img = h('img', { class: 'px', attrs: { src: iconUrl(name), alt: name, width: String(size), height: String(size) } });
  return img;
}

export function iconHtml(name: IconName, size = 14): string {
  return `<img class="px" src="${iconUrl(name)}" alt="${name}" width="${size}" height="${size}" style="vertical-align:-2px">`;
}

export function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 100000) return `${Math.round(n / 1000)}k`;
  if (a >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.floor(n)}`;
}

export function fmtRate(n: number): string {
  const sign = n > 0.004 ? '+' : n < -0.004 ? '−' : '';
  const a = Math.abs(n);
  return `${sign}${a >= 10 ? a.toFixed(0) : a.toFixed(1)}/s`;
}

export function costHtml(cost: Cost, have?: Partial<Record<ResourceKey, number>>): string {
  const parts: string[] = [];
  for (const k of ['food', 'wood', 'stone', 'gold', 'knowledge'] as ResourceKey[]) {
    const v = cost[k];
    if (!v) continue;
    const short = have && (have[k] ?? 0) < v;
    parts.push(`<span class="${short ? 'short' : ''}">${iconHtml(k, 11)}${v}</span>`);
  }
  return parts.length ? parts.join(' ') : 'Free';
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;

export function formatTime(ticks: number): string {
  const m = Math.floor(ticks / 60);
  const s = Math.floor(ticks % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
