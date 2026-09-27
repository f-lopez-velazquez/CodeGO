'use strict';

function createFocusGuard(options = {}) {
  const now = options.now || Date.now;
  const internalGraceMs = options.internalGraceMs || 700;
  const maximumInternalMs = options.maximumInternalMs || 10000;
  let blurStartedAt = null;
  let pythonWindowWasActive = false;
  let internalInteractionUntil = 0;

  function reset() {
    blurStartedAt = null;
    pythonWindowWasActive = false;
    internalInteractionUntil = 0;
  }

  function setInternalInteraction(active) {
    internalInteractionUntil = now() + (active ? maximumInternalMs : internalGraceMs);
    blurStartedAt = null;
    pythonWindowWasActive = false;
  }

  function internalInteractionActive() {
    return now() < internalInteractionUntil;
  }

  function blur({ sessionActive, ignored = false, pythonWindow = false } = {}) {
    if (!sessionActive) {
      reset();
      return { violation: false, reason: 'inactive-session' };
    }
    if (internalInteractionActive() || ignored) {
      blurStartedAt = null;
      pythonWindowWasActive = false;
      return { violation: false, reason: internalInteractionActive() ? 'internal-interaction' : 'allowed-operation' };
    }
    if (pythonWindow) {
      blurStartedAt = null;
      pythonWindowWasActive = true;
      return { violation: false, reason: 'python-window' };
    }

    pythonWindowWasActive = false;
    blurStartedAt = now();
    return { violation: true, startedAt: blurStartedAt };
  }

  function focus({ sessionActive } = {}) {
    if (!sessionActive) {
      reset();
      return { violation: false, reason: 'inactive-session' };
    }
    if (internalInteractionActive()) {
      blurStartedAt = null;
      pythonWindowWasActive = false;
      return { violation: false, reason: 'internal-interaction' };
    }
    if (pythonWindowWasActive) {
      pythonWindowWasActive = false;
      return { violation: false, reason: 'python-window' };
    }
    if (blurStartedAt === null) {
      return { violation: false, reason: 'no-recorded-blur' };
    }

    const durationSeconds = Math.max(0, now() - blurStartedAt) / 1000;
    blurStartedAt = null;
    return { violation: true, durationSeconds };
  }

  return { blur, focus, reset, setInternalInteraction, internalInteractionActive };
}

module.exports = { createFocusGuard };
