import type { ToastKind } from '../game/GameController';
import { $, clear, h } from './dom';

// ---- Tooltip -----------------------------------------------------------------

let tipOwner: HTMLElement | null = null;

export function showTip(html: string, x: number, y: number): void {
  const tip = $('#tooltip');
  tip.innerHTML = html;
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - r.width - 6, Math.max(6, x + 14));
  let top = y + 16;
  if (top + r.height > window.innerHeight - 6) top = y - r.height - 10;
  tip.style.left = `${left}px`;
  tip.style.top = `${Math.max(6, top)}px`;
}

export function hideTip(): void {
  $('#tooltip').hidden = true;
  tipOwner = null;
}

/** Attach a dynamic tooltip to an element (hover on desktop, long-press/tap on touch). */
export function tip(el: HTMLElement, content: () => string): void {
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    tipOwner = el;
    showTip(content(), e.clientX, e.clientY);
  });
  el.addEventListener('pointermove', (e) => {
    if (tipOwner === el && e.pointerType === 'mouse') showTip(content(), e.clientX, e.clientY);
  });
  el.addEventListener('pointerleave', () => {
    if (tipOwner === el) hideTip();
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  let pressTimer = 0;
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    pressTimer = window.setTimeout(() => {
      tipOwner = el;
      showTip(content(), t.clientX, t.clientY);
      window.setTimeout(() => tipOwner === el && hideTip(), 3500);
    }, 380);
  }, { passive: true });
  el.addEventListener('touchend', () => clearTimeout(pressTimer));
  el.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
}

/** Tap-to-show tooltip for non-interactive elements (resources) on touch devices. */
export function tapTip(el: HTMLElement, content: () => string): void {
  tip(el, content);
  el.addEventListener('click', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse') return;
    const r = el.getBoundingClientRect();
    if (tipOwner === el) return hideTip();
    tipOwner = el;
    showTip(content(), r.left, r.bottom - 8);
    window.setTimeout(() => tipOwner === el && hideTip(), 4000);
  });
}

// ---- Toasts --------------------------------------------------------------------

export function toast(text: string, kind: ToastKind = 'info', ms = 3600): void {
  const root = $('#toasts');
  const el = h('div', { class: `toast ${kind}`, text });
  root.prepend(el);
  while (root.children.length > 4) root.lastElementChild?.remove();
  window.setTimeout(() => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 450);
  }, ms);
}

// ---- Modals ----------------------------------------------------------------------

export interface ModalHandle {
  el: HTMLElement;
  close: () => void;
}

const stack: { backdrop: HTMLElement; onClose?: () => void; dismissable: boolean }[] = [];

export function openModal(
  build: (body: HTMLElement, close: () => void) => void,
  opts: { narrow?: boolean; dismissable?: boolean; onClose?: () => void; label?: string } = {},
): ModalHandle {
  const dismissable = opts.dismissable ?? true;
  const body = h('div', { class: `modal panel${opts.narrow ? ' narrow' : ''}`, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.label ?? 'Dialog' } });
  const backdrop = h('div', { class: 'modal-backdrop' }, body);
  const entry = { backdrop, onClose: opts.onClose, dismissable };
  const close = (): void => {
    const i = stack.indexOf(entry);
    if (i < 0) return;
    stack.splice(i, 1);
    backdrop.remove();
    hideTip();
    entry.onClose?.();
  };
  if (dismissable) {
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
    body.append(h('button', { class: 'icon-btn close', text: '✕', attrs: { 'aria-label': 'Close' }, onclick: close }));
  }
  const content = h('div');
  body.append(content);
  build(content, close);
  $('#modal-root').append(backdrop);
  stack.push(entry);
  const first = body.querySelector<HTMLElement>('button:not(.close):not(:disabled), input');
  first?.focus({ preventScroll: true });
  return { el: content, close };
}

/** Rebuild the content of an open modal in place. */
export function rebuild(handle: ModalHandle, build: (body: HTMLElement, close: () => void) => void): void {
  const scroll = handle.el.parentElement?.scrollTop ?? 0;
  clear(handle.el);
  build(handle.el, handle.close);
  if (handle.el.parentElement) handle.el.parentElement.scrollTop = scroll;
}

export function closeTopModal(): boolean {
  const top = stack[stack.length - 1];
  if (!top || !top.dismissable) return false;
  top.backdrop.querySelector<HTMLButtonElement>('.close')?.click();
  return true;
}

export function modalOpen(): boolean {
  return stack.length > 0;
}

export function closeAllModals(): void {
  for (const m of [...stack].reverse()) {
    m.backdrop.remove();
    m.onClose?.();
  }
  stack.length = 0;
}
