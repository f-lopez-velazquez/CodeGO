/* Keep utility menus in the top layer and inside the visual viewport. */
(function (root) {
  'use strict';
  function attach(details, panel) {
    const trigger = details.querySelector(':scope > summary');
    if (!trigger || !panel || details.dataset.viewportMenu) return;
    details.dataset.viewportMenu = 'true'; panel.classList.add('viewport-menu');
    const nativePopover = typeof panel.showPopover === 'function';
    if (nativePopover) panel.setAttribute('popover', 'auto');
    let active = false, originalParent, nextSibling;
    const viewport = () => ({ width: window.visualViewport?.width || innerWidth, height: window.visualViewport?.height || innerHeight, x: window.visualViewport?.offsetLeft || 0, y: window.visualViewport?.offsetTop || 0 });
    function position() {
      if (!active) return;
      const view = viewport(), box = trigger.getBoundingClientRect(), margin = 10, gap = 6;
      const below = view.y + view.height - margin - box.bottom - gap, above = box.top - view.y - margin - gap;
      const down = below >= Math.min(panel.scrollHeight, 220) || below >= above;
      const available = Math.max(80, down ? below : above);
      Object.assign(panel.style, { position: 'fixed', inset: 'auto', margin: '0', boxSizing: 'border-box', width: `${Math.min(300, view.width - margin * 2)}px`, maxHeight: `${Math.min(view.height - margin * 2, available)}px`, overflowY: 'auto', overscrollBehavior: 'contain' });
      const height = panel.getBoundingClientRect().height;
      panel.style.left = `${Math.max(view.x + margin, Math.min(box.left, view.x + view.width - panel.getBoundingClientRect().width - margin))}px`;
      panel.style.top = `${Math.max(view.y + margin, Math.min(down ? box.bottom + gap : box.top - gap - height, view.y + view.height - height - margin))}px`;
    }
    function close(restoreFocus = false) {
      if (!active) return;
      active = false; details.open = false;
      if (nativePopover) { if (panel.matches(':popover-open')) panel.hidePopover(); }
      else { panel.hidden = true; originalParent.insertBefore(panel, nextSibling); }
      if (restoreFocus) trigger.focus({ preventScroll: true });
    }
    details.addEventListener('toggle', () => {
      if (!details.open) return close();
      if (active) return;
      active = true;
      if (nativePopover) panel.showPopover();
      else { originalParent = panel.parentNode; nextSibling = panel.nextSibling; document.body.append(panel); panel.hidden = false; }
      position();
    });
    panel.addEventListener('toggle', event => { if (nativePopover && event.newState === 'closed') { active = false; details.open = false; } });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const options = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)')].filter(el => el.checkVisibility());
        if (!options.length) return;
        event.preventDefault(); const index = options.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next].focus();
      }
    });
    panel.addEventListener('click', event => { if (event.target.closest('button, a')) close(); });
    document.addEventListener('pointerdown', event => { if (active && !panel.contains(event.target) && !trigger.contains(event.target)) close(); });
    window.addEventListener('resize', position); window.visualViewport?.addEventListener('resize', position);
    document.addEventListener('scroll', event => { if (active && !panel.contains(event.target)) position(); }, true);
    trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); details.open = true; requestAnimationFrame(() => panel.querySelector('button:not(:disabled), a[href]')?.focus()); } });
  }
  function installContext(getActions, onError = () => {}) {
    const panel = document.createElement('div'); panel.className = 'viewport-menu context-commands'; panel.setAttribute('role', 'menu'); panel.setAttribute('aria-label', 'Acciones de CodeGO');
    const nativePopover = typeof panel.showPopover === 'function';
    if (nativePopover) panel.setAttribute('popover', 'manual'); else panel.hidden = true;
    document.body.append(panel);
    let previousFocus;
    const close = restore => { if (nativePopover) { if (panel.matches(':popover-open')) panel.hidePopover(); } else panel.hidden = true; if (restore) previousFocus?.focus?.({ preventScroll: true }); };
    document.addEventListener('contextmenu', event => {
      if (event.defaultPrevented) return;
      const actions = getActions(event) || [];
      event.preventDefault(); close(false); previousFocus = document.activeElement;
      panel.replaceChildren();
      for (const action of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = action.label; button.disabled = Boolean(action.disabled);
        button.onclick = async () => { close(false); try { await action.run?.(); } catch (error) { onError(error.message || 'No se pudo completar la acción.'); } };
        panel.append(button);
      }
      if (!actions.length) return;
      Object.assign(panel.style, { position: 'fixed', inset: 'auto', margin: '0', width: `${Math.min(280, innerWidth - 20)}px`, maxHeight: `${innerHeight - 20}px`, overflowY: 'auto' });
      if (nativePopover) panel.showPopover(); else panel.hidden = false;
      const bounds = panel.getBoundingClientRect(), target = event.target.getBoundingClientRect();
      panel.style.left = `${Math.max(10, Math.min(event.clientX || target.left, innerWidth - bounds.width - 10))}px`;
      panel.style.top = `${Math.max(10, Math.min(event.clientY || target.bottom, innerHeight - bounds.height - 10))}px`;
      panel.querySelector('button:not(:disabled)')?.focus();
    });
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const items = [...panel.querySelectorAll('button:not(:disabled)')]; if (!items.length) return;
        event.preventDefault(); const index = items.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }
    });
    document.addEventListener('pointerdown', event => { if (!panel.contains(event.target)) close(false); });
    window.addEventListener('resize', () => close(false)); window.addEventListener('blur', () => close(false));
  }
  root.CodeGOViewportMenus = { attach, installContext };
  document.querySelectorAll('.lobby-tools-menu, .editor-options-menu, .account-menu').forEach(details => attach(details, details.querySelector(':scope > .status-tools, :scope > .editor-quick-options, :scope > div')));
})(globalThis);
