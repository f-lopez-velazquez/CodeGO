/* Keep utility menus in the top layer and inside the visual viewport. */
(function (root) {
  'use strict';
  const viewport = () => ({ width: window.visualViewport?.width || innerWidth, height: window.visualViewport?.height || innerHeight, x: window.visualViewport?.offsetLeft || 0, y: window.visualViewport?.offsetTop || 0 });
  const scaleOf = element => element.offsetWidth ? element.getBoundingClientRect().width / element.offsetWidth : 1;
  function attach(details, panel) {
    const trigger = details.querySelector(':scope > summary');
    if (!trigger || !panel || details.dataset.viewportMenu) return;
    details.dataset.viewportMenu = 'true'; panel.classList.add('viewport-menu');
    const nativePopover = typeof panel.showPopover === 'function';
    if (nativePopover) panel.setAttribute('popover', 'auto');
    let active = false, originalParent, nextSibling;
    function position() {
      if (!active) return;
      const view = viewport(), box = trigger.getBoundingClientRect(), margin = 10, gap = 6;
      panel.style.width = '300px';
      const scale = scaleOf(panel);
      const below = view.y + view.height - margin - box.bottom - gap, above = box.top - view.y - margin - gap;
      const down = below >= Math.min(panel.scrollHeight * scale, 220 * scale) || below >= above;
      const available = Math.max(80, down ? below : above);
      Object.assign(panel.style, { position: 'fixed', inset: 'auto', margin: '0', boxSizing: 'border-box', width: `${Math.min(300, (view.width - margin * 2) / scale)}px`, maxHeight: `${Math.min(view.height - margin * 2, available) / scale}px`, overflowY: 'auto', overscrollBehavior: 'contain' });
      const height = panel.getBoundingClientRect().height;
      panel.style.left = `${Math.max(view.x + margin, Math.min(box.left, view.x + view.width - panel.getBoundingClientRect().width - margin)) / scale}px`;
      panel.style.top = `${Math.max(view.y + margin, Math.min(down ? box.bottom + gap : box.top - gap - height, view.y + view.height - height - margin)) / scale}px`;
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
    panel.addEventListener('click', event => { if (event.target.closest('button, a') && !event.target.closest('[data-menu-stay-open]')) close(); });
    document.addEventListener('pointerdown', event => { if (active && !panel.contains(event.target) && !trigger.contains(event.target)) close(); });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (active) position(); }).observe(panel);
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
      Object.assign(panel.style, { position: 'fixed', inset: 'auto', margin: '0', width: '280px', overflowY: 'auto' });
      if (nativePopover) panel.showPopover(); else panel.hidden = false;
      const view = viewport(), scale = scaleOf(panel);
      panel.style.width = `${Math.min(280, (view.width - 20) / scale)}px`; panel.style.maxHeight = `${(view.height - 20) / scale}px`;
      const bounds = panel.getBoundingClientRect(), target = event.target.getBoundingClientRect();
      panel.style.left = `${Math.max(view.x + 10, Math.min(event.clientX || target.left, view.x + view.width - bounds.width - 10)) / scale}px`;
      panel.style.top = `${Math.max(view.y + 10, Math.min(event.clientY || target.bottom, view.y + view.height - bounds.height - 10)) / scale}px`;
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
  function installTooltips() {
    const tip = document.createElement('div'); tip.id = 'codego-tooltip'; tip.className = 'codego-tooltip'; tip.setAttribute('role', 'tooltip');
    const popover = typeof tip.showPopover === 'function';
    if (popover) tip.setAttribute('popover', 'manual'); else tip.hidden = true;
    document.body.append(tip);
    let origin, timer;
    function normalize(element) {
      const title = element.getAttribute('title');
      if (title) { element.dataset.tooltip = title; element.removeAttribute('title'); }
      if (element.matches('button, summary') && !element.hasAttribute('aria-label') && !element.textContent.trim()) element.setAttribute('aria-label', element.dataset.tooltip || 'Acción');
    }
    document.querySelectorAll('[title]').forEach(normalize);
    function hide() {
      clearTimeout(timer);
      if (popover) { if (tip.matches(':popover-open')) tip.hidePopover(); } else tip.hidden = true;
      if (origin) { const ids = (origin.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && id !== tip.id); if (ids.length) origin.setAttribute('aria-describedby', ids.join(' ')); else origin.removeAttribute('aria-describedby'); }
      origin = null;
    }
    function show(target, delay) {
      if (target === origin) return;
      hide(); normalize(target);
      if (!target.dataset.tooltip?.trim()) return;
      origin = target;
      timer = setTimeout(() => {
        if (!origin?.isConnected || !origin.checkVisibility()) return hide();
        tip.textContent = origin.dataset.tooltip;
        origin.setAttribute('aria-describedby', [...new Set((origin.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).concat(tip.id))].join(' '));
        if (popover) tip.showPopover(); else tip.hidden = false;
        const view = viewport(), anchor = origin.getBoundingClientRect(), scale = scaleOf(tip);
        tip.style.maxWidth = `${Math.min(280, (view.width - 24) / scale)}px`;
        tip.style.maxHeight = `${(view.height - 24) / scale}px`;
        const bounds = tip.getBoundingClientRect();
        tip.style.left = `${Math.max(view.x + 12, Math.min(anchor.left + (anchor.width - bounds.width) / 2, view.x + view.width - bounds.width - 12)) / scale}px`;
        tip.style.top = `${Math.max(view.y + 12, Math.min(anchor.bottom + 8 + bounds.height <= view.y + view.height - 12 ? anchor.bottom + 8 : anchor.top - bounds.height - 8, view.y + view.height - bounds.height - 12)) / scale}px`;
      }, delay);
    }
    document.addEventListener('mouseover', event => { const target = event.target.closest('[title], [data-tooltip]'); if (target) show(target, 550); else hide(); }, true);
    document.addEventListener('focusin', event => { const target = event.target.closest('[title], [data-tooltip]'); if (target) show(target, 300); else hide(); });
    document.addEventListener('focusout', hide); document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true); window.addEventListener('resize', hide); window.addEventListener('blur', hide);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  }
  root.CodeGOViewportMenus = { attach, installContext };
  installTooltips();
  document.querySelectorAll('.lobby-tools-menu, .editor-options-menu, .account-menu, .workspace-session-menu, .workspace-tools-menu, .explorer-options-menu, .terminal-options-menu').forEach(details => attach(details, details.querySelector(':scope > .status-tools, :scope > .editor-quick-options, :scope > .workspace-session-panel, :scope > div')));
})(globalThis);
