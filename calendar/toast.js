const host = document.getElementById('toasts');

export function toast(message, { actionLabel = 'Undo', onAction, duration = 6000 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  if (onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => { onAction(); el.remove(); });
    el.append(btn);
  }
  host.append(el);
  setTimeout(() => el.remove(), duration);
}
