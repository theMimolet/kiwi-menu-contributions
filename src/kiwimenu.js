/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * kiwimenu.js - Implements the main Kiwi Menu functionality.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import { openForceQuitOverlay } from './forceQuitOverlay.js';
import { RecentItemsSubmenu } from './recentItemsSubmenu.js';

function loadJsonFile(basePath, segments) {
  const textDecoder = new TextDecoder();
  const filePath = GLib.build_filenamev([basePath, ...segments]);

  try {
    const file = Gio.File.new_for_path(filePath);
    const [, contents] = file.load_contents(null);
    const parsed = JSON.parse(textDecoder.decode(contents));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logError(error, `Failed to load JSON data from ${filePath}`);
    return [];
  }
}

export const KiwiMenu = GObject.registerClass(
  class KiwiMenu extends PanelMenu.Button {
    _init(settings, extensionPath, extension) {
      super._init(0.5, 'KiwiMenu');

  this._settings = settings;
  this._extensionPath = extensionPath;
  this._extension = extension;
  this._settingsSignalIds = [];
  this._menuOpenSignalId = 0;
  this._recentMenuManager = new PopupMenu.PopupMenuManager(this);

      this._icons = Object.freeze(
        loadJsonFile(this._extensionPath, ['src', 'icons.json']).map((icon) =>
          Object.freeze(icon)
        )
      );
      this._layout = Object.freeze(
        loadJsonFile(this._extensionPath, ['src', 'menulayout.json']).map((item) =>
          Object.freeze(item)
        )
      );

      if (this.menu?.actor) {
        this.menu.actor.add_style_class_name('kiwi-main-menu');
        if (typeof this.menu.setSourceAlignment === 'function') {
          this.menu.setSourceAlignment(0.5);
        }
      }

      this._icon = new St.Icon({
        style_class: 'menu-button',
      });
      this.add_child(this._icon);

      this._settingsSignalIds.push(
        this._settings.connect('changed::icon', () => this._setIcon())
      );
      this._settingsSignalIds.push(
        this._settings.connect('changed::activity-menu-visibility', () =>
          this._syncActivitiesVisibility()
        )
      );

      this._menuOpenSignalId = this.menu.connect(
        'open-state-changed',
        (_, isOpen) => {
          if (isOpen) {
            this._renderPopupMenu();
          }
        }
      );

      this._setIcon();
      this._syncActivitiesVisibility();
      this._renderPopupMenu();
    }

    destroy() {
      this._settingsSignalIds.forEach((id) => this._settings.disconnect(id));
      this._settingsSignalIds = [];

      if (this._menuOpenSignalId !== 0) {
        this.menu.disconnect(this._menuOpenSignalId);
        this._menuOpenSignalId = 0;
      }

      this._showActivitiesButton();

      this._settings = null;

      super.destroy();
    }

    _setIcon() {
      if (!this._icons || this._icons.length === 0) {
        return;
      }

      const iconIndex = this._settings.get_int('icon');
      const iconInfo = this._icons[iconIndex] ?? this._icons[0];
      if (!iconInfo) {
        return;
      }
      const iconPath = `${this._extensionPath}${iconInfo.path}`;

      this._icon.gicon = Gio.icon_new_for_string(iconPath);
    }

    _syncActivitiesVisibility() {
      const container = this._getActivitiesContainer();
      if (!container) {
        return;
      }

      const shouldShow = this._settings.get_boolean('activity-menu-visibility');
      if (shouldShow) {
        container.show();
      } else {
        container.hide();
      }
    }

    _gettext(text) {
      return this._extension?.gettext(text) ?? text;
    }

    _showActivitiesButton() {
      const container = this._getActivitiesContainer();
      if (container) {
        container.show();
      }
    }

    _getActivitiesContainer() {
      const statusArea = Main.panel?.statusArea;
      if (!statusArea) {
        return null;
      }

      const activitiesEntry =
        statusArea.activities ??
        statusArea.activitiesButton ??
        statusArea['activities'];

      if (!activitiesEntry) {
        return null;
      }

      return activitiesEntry.container ?? activitiesEntry;
    }

    _renderPopupMenu() {
      this.menu.removeAll();

      const layout = this._generateLayout();
      layout.forEach((item) => {
        switch (item.type) {
          case 'menu':
            this._makeMenu(item.title, item.cmds);
            break;
          case 'recent-items':
            this._makeRecentItemsMenu(item.title);
            break;
          case 'separator':
            this._makeSeparator();
            break;
        }
      });
    }

    _generateLayout() {
      const fullName = GLib.get_real_name() || GLib.get_user_name() || '';

      const layoutSource = this._layout ?? [];

      return layoutSource.map((item) => {
        // Translate menu title
        let translatedTitle = item.title;
        if (item.title) {
          translatedTitle = this._gettext(item.title);
        }

        // Special handling for logout with username
        if (item.type === 'menu' && item.cmds?.includes('--logout')) {
          const title = fullName
            ? this._gettext('Log Out %s...').format(fullName)
            : translatedTitle;
          return {
            ...item,
            title,
            cmds: item.cmds ? [...item.cmds] : undefined,
          };
        }

        return {
          ...item,
          title: translatedTitle,
          cmds: item.cmds ? [...item.cmds] : undefined,
        };
      });
    }

    _makeMenu(title, cmds) {
      const menuItem = new PopupMenu.PopupMenuItem(title);
      const isForceQuit = Array.isArray(cmds) && cmds.length === 1 && cmds[0] === 'xkill';

      menuItem.connect('activate', () => {
        if (isForceQuit) {
          this.menu.close(true);
          this._openForceQuitOverlay();
          return;
        }

        Util.spawn(cmds);
      });
      this.menu.addMenuItem(menuItem);
    }

    _makeRecentItemsMenu(title) {
      const submenuItem = new RecentItemsSubmenu(title, this.menu, this._recentMenuManager, this._extension);
      this.menu.addMenuItem(submenuItem);
    }

    _makeSeparator() {
      const separator = new PopupMenu.PopupSeparatorMenuItem();
      this.menu.addMenuItem(separator);
    }

    _openForceQuitOverlay() {
      try {
        openForceQuitOverlay();
      } catch (error) {
        logError(error, 'Failed to open Force Quit overlay');
      }
    }
  }
);
