/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * extension.js - Entry point for the Kiwi Menu GNOME Shell extension.
 */

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KiwiMenu } from './src/kiwimenu.js';

export default class KiwiMenuExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._indicator = new KiwiMenu(this._settings, this.path, this);
    Main.panel.addToStatusArea('KiwiMenuButton', this._indicator, 0, 'left');
  }

  disable() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._settings = null;
  }
}
