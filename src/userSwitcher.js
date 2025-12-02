/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * userSwitcher.js - Implements a macOS-style user switcher button for Kiwi Menu.
 */

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import Gdm from 'gi://Gdm';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import { Avatar as UserAvatar } from 'resource:///org/gnome/shell/ui/userWidget.js';

const DEFAULT_BUTTON_ICON = 'system-users-symbolic';
const AVATAR_ICON_SIZE = 64;
const MINIMUM_VISIBLE_UID = 1000;

export const UserSwitcherButton = GObject.registerClass(
  class UserSwitcherButton extends PanelMenu.Button {
    _init(extension) {
      super._init(1.0, 'KiwiUserSwitcher');

      this._extension = extension;
      this._menuSignals = [];
      this._userManager = null;
      this._gettext = extension?.gettext?.bind(extension) ?? ((text) => text);
      this._buttonIcon = new St.Icon({
        icon_name: DEFAULT_BUTTON_ICON,
        icon_size: 18,
        style_class: 'kiwi-user-switcher-button',
      });
      this.add_child(this._buttonIcon);

      if (this.menu?.actor) {
        this.menu.actor.add_style_class_name('kiwi-user-switcher-menu');
        this.menu.actor.set_x_align(Clutter.ActorAlign.END);
        this.menu.actor.set_x_expand(false);
        if (typeof this.menu.setSourceAlignment === 'function') {
          this.menu.setSourceAlignment(1);
        }
      }

      this._menuOpenSignalId = this.menu?.connect('open-state-changed', (_, open) => {
        if (open) {
          this._rebuildMenu();
        }
      }) ?? 0;

      this._initUserManager();
    }

    destroy() {
      this._disconnectUserManagerSignals();

      if (this._menuOpenSignalId) {
        this.menu.disconnect(this._menuOpenSignalId);
        this._menuOpenSignalId = 0;
      }

      this._userManager = null;
      this._extension = null;

      super.destroy();
    }

    _initUserManager() {
      try {
        this._userManager = AccountsService.UserManager.get_default();
      } catch (error) {
        logError(error, 'Failed to acquire AccountsService.UserManager');
        return;
      }

      if (!this._userManager) {
        return;
      }

      this._menuSignals = [
        this._userManager.connect('notify::is-loaded', () => this._rebuildMenu()),
        this._userManager.connect('user-added', () => this._rebuildMenu()),
        this._userManager.connect('user-removed', () => this._rebuildMenu()),
        this._userManager.connect('user-changed', () => this._rebuildMenu()),
        this._userManager.connect('user-is-logged-in-changed', () => this._rebuildMenu()),
      ];

      try {
        if (this._userManager.is_loaded) {
          this._rebuildMenu();
        } else {
          this._userManager.list_users();
        }
      } catch (error) {
        logError(error, 'Failed to initialize user list');
      }
    }

    _disconnectUserManagerSignals() {
      if (!this._userManager || !this._menuSignals) {
        return;
      }

      this._menuSignals.forEach((id) => {
        try {
          this._userManager.disconnect(id);
        } catch (error) {
          logError(error, 'Failed to disconnect AccountsService signal');
        }
      });
      this._menuSignals = [];
    }

    _rebuildMenu() {
      if (!this._userManager || !this.menu) {
        return;
      }

      if (!this._userManager.is_loaded) {
        return;
      }

      this.menu.removeAll();

      const currentUserName = GLib.get_user_name();
      const users = this._collectVisibleUsers(currentUserName);

      if (users.length === 0) {
        const placeholder = new PopupMenu.PopupMenuItem(this._gettext('No eligible user accounts found'));
        placeholder.setSensitive(false);
        placeholder.actor.add_style_class_name('kiwi-user-switcher-empty');
        this.menu.addMenuItem(placeholder);
      } else {
        const gridSection = new PopupMenu.PopupMenuSection();
        
        const gridContainer = new St.BoxLayout({
          vertical: true,
          style_class: 'kiwi-user-grid',
          x_expand: true,
        });

        let currentRow = null;
        users.forEach((user, index) => {
          if (index % 3 === 0) {
            currentRow = new St.BoxLayout({
              vertical: false,
              x_expand: true,
            });
            gridContainer.add_child(currentRow);
          }

          const userWidget = this._createUserWidget(user, currentUserName);
          userWidget.set_x_expand(true);
          currentRow.add_child(userWidget);
        });

        gridSection.actor.add_child(gridContainer);
        this.menu.addMenuItem(gridSection);
      }

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      this._addActionItem(this._gettext('Login Window...'), () => this._gotoLoginWindow());
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this._addActionItem(
        this._gettext('Users & Groups Settings...'),
        () => this._openUserSettings()
      );

      this._updatePanelIcon(users, currentUserName);
    }

    _collectVisibleUsers(currentUserName) {
      let userList = [];
      try {
        userList = this._userManager.list_users() ?? [];
      } catch (error) {
        logError(error, 'Failed to list AccountsService users');
        return [];
      }

      const filtered = userList.filter((user) => {
        if (!user || !user.is_loaded) {
          return false;
        }

        const uid = Number.parseInt(user.get_uid?.() ?? '-1', 10);
        if (!Number.isFinite(uid)) {
          return false;
        }

        const username = user.get_user_name?.();
        if (!username) {
          return false;
        }

        if (username === currentUserName) {
          return true;
        }

        return uid >= MINIMUM_VISIBLE_UID && !user.system_account;
      });

      return filtered.sort((a, b) => this._compareUsers(a, b, currentUserName));
    }

    _compareUsers(a, b, currentUserName) {
      const aIsCurrent = a.get_user_name() === currentUserName;
      const bIsCurrent = b.get_user_name() === currentUserName;

      if (aIsCurrent && !bIsCurrent) {
        return -1;
      }

      if (!aIsCurrent && bIsCurrent) {
        return 1;
      }

      const aName = a.get_real_name?.() || a.get_user_name?.() || '';
      const bName = b.get_real_name?.() || b.get_user_name?.() || '';
      return GLib.utf8_collate(aName, bName);
    }

    _createUserWidget(user, currentUserName) {
      const displayName = user.get_real_name?.() || user.get_user_name?.() || '';
      const username = user.get_user_name?.() || '';
      const isCurrent = username === currentUserName;
      const isSignedIn = Boolean(user.is_logged_in_anywhere?.());

      const button = new St.Button({
        style_class: 'kiwi-user-item',
        reactive: true,
        can_focus: true,
        x_expand: true,
        y_expand: true,
      });
      button.set_x_align(Clutter.ActorAlign.FILL);

      if (isCurrent) {
        button.add_style_class_name('current-user');
      }

      const content = new St.BoxLayout({
        vertical: true,
        style_class: 'kiwi-user-item-content',
        x_align: Clutter.ActorAlign.CENTER,
      });

      const avatarBin = new St.Bin({ style_class: 'kiwi-user-card-avatar-frame' });
      avatarBin.clip_to_allocation = true;

      if (isCurrent || isSignedIn) {
        avatarBin.add_style_class_name('logged-in');
      }

      const avatar = new UserAvatar(user, {
        styleClass: 'kiwi-user-card-avatar',
        iconSize: AVATAR_ICON_SIZE,
        reactive: false,
      });
      avatar.update();
      avatarBin.set_child(avatar);
      content.add_child(avatarBin);

      const nameLabel = new St.Label({
        text: displayName,
        style_class: 'kiwi-user-card-name',
        x_align: Clutter.ActorAlign.CENTER,
      });

      content.add_child(nameLabel);
      button.set_child(content);

      button.connect('clicked', () => this._activateUser(user));

      return button;
    }

    _addActionItem(label, callback) {
      const item = new PopupMenu.PopupMenuItem(label);
      item.connect('activate', () => {
        this.menu.close(true);
        callback();
      });
      this.menu.addMenuItem(item);
    }

    _activateUser(user) {
      if (!user) {
        return;
      }

      this.menu.close(true);

      const username = user.get_user_name?.();
      if (!username) {
        return;
      }

      // If clicking on current user, just close the menu - nothing to switch to
      const currentUserName = GLib.get_user_name();
      if (username === currentUserName) {
        return;
      }

      // Try to find and activate user's session
      // Don't rely on is_logged_in_anywhere() as it can be stale
      const activated = this._activateUserSession(username);
      
      if (!activated) {
        // No session found, go to GDM login screen
        this._gotoLoginWindow();
      }
    }

    _activateUserSession(username) {
      // Get the session ID for this user using loginctl
      try {
        const proc = Gio.Subprocess.new(
          ['loginctl', 'list-sessions', '--no-legend', '--no-pager'],
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );

        const [, stdout] = proc.communicate_utf8(null, null);
        if (!stdout) {
          return false;
        }

        // Parse loginctl output to find user's graphical session
        // Format: SESSION UID USER SEAT LEADER CLASS TTY IDLE SINCE
        const lines = stdout.trim().split('\n');
        let sessionId = null;

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 6) {
            const [sid, , user, seat, , sessionClass] = parts;
            // Match username and look for graphical session (user class on a seat)
            if (user === username && seat && seat !== '-' && sessionClass === 'user') {
              sessionId = sid;
              break;
            }
          }
        }

        if (sessionId) {
          Util.spawn(['loginctl', 'activate', sessionId]);
          return true;
        }
        
        return false;
      } catch (error) {
        logError(error, 'Failed to activate user session');
        return false;
      }
    }

    _gotoLoginWindow() {
      // Lock the screen first if screen shield is available
      if (Main.screenShield) {
        Main.screenShield.lock(false);
      }

      // Use repaint func to ensure lock animation completes before switching to GDM
      Clutter.threads_add_repaint_func(Clutter.RepaintFlags.POST_PAINT, () => {
        try {
          Gdm.goto_login_session_sync(null);
        } catch (error) {
          logError(error, 'Failed to switch to GDM login session');
        }
        return false;
      });
    }

    _openUserSettings() {
      try {
        Util.spawn(['gnome-control-center', 'system', 'users']);
      } catch (error) {
        logError(error, 'Failed to open Users & Groups settings');
      }
    }

    _updatePanelIcon(users, currentUserName) {
      this._buttonIcon.gicon = null;
      this._buttonIcon.icon_name = DEFAULT_BUTTON_ICON;
    }
  }
);
