const test = require('node:test');
const assert = require('node:assert/strict');
const { isHyprland, sourceLikelyOpensGui, activeHyprlandWorkspace, placeHyprlandWindow } = require('../src/main/window-integration');

const hyprland = { XDG_CURRENT_DESKTOP: 'Hyprland', HYPRLAND_INSTANCE_SIGNATURE: 'test' };

test('detects graphical Python libraries without matching plain terminal programs', () => {
  assert.equal(sourceLikelyOpensGui('import pygame\npygame.init()'), true);
  assert.equal(sourceLikelyOpensGui('from tkinter import Tk'), true);
  assert.equal(sourceLikelyOpensGui('import matplotlib.pyplot as plt'), true);
  assert.equal(sourceLikelyOpensGui('print("pygame")'), false);
  assert.equal(sourceLikelyOpensGui('import requests'), false);
});

test('reads the active Hyprland workspace and uses its current Lua dispatcher', () => {
  const calls = [];
  const execute = (file, args) => {
    calls.push([file, ...args]);
    if (args[0] === '-j') return JSON.stringify({ id: 3, name: '3' });
    return 'ok';
  };
  assert.equal(isHyprland(hyprland), true);
  assert.equal(activeHyprlandWorkspace({ environment: hyprland, execute }), '3');
  assert.equal(placeHyprlandWindow(4210, '3', { environment: hyprland, execute }), true);
  assert.match(calls.at(-1).join(' '), /hl\.dsp\.window\.move/);
  assert.match(calls.at(-1).join(' '), /pid:4210/);
});

test('falls back to the legacy dispatcher and rejects unsafe identifiers', () => {
  const calls = [];
  const execute = (_file, args) => {
    calls.push(args);
    if (args[0] === 'eval') throw new Error('old Hyprland');
    return 'ok';
  };
  assert.equal(placeHyprlandWindow(42, '2', { environment: hyprland, execute }), true);
  assert.deepEqual(calls.at(-2), ['dispatch', 'movetoworkspace', '2,pid:42']);
  assert.equal(placeHyprlandWindow('42;rm', '2', { environment: hyprland, execute }), false);
  assert.equal(placeHyprlandWindow(42, '2;rm', { environment: hyprland, execute }), false);
});
