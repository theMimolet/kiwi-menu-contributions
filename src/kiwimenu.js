import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

const TEXT_DECODER = new TextDecoder();

function loadJsonFile(basePath, segments) {
  const filePath = GLib.build_filenamev([basePath, ...segments]);

  try {
    const file = Gio.File.new_for_path(filePath);
    const [, contents] = file.load_contents(null);
    const parsed = JSON.parse(TEXT_DECODER.decode(contents));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logError(error, `Failed to load JSON data from ${filePath}`);
    return [];
  }
}

const MAX_RECENT_ITEMS = 10;
const RECENT_ITEMS_FILE = GLib.build_filenamev([
  GLib.get_user_data_dir(),
  'recently-used.xbel',
]);
// Delay before closing the recent popup so pointer can cross the bridge.
const HOVER_CLOSE_DELAY_MS = 200;
// Delay before opening the recent popup to avoid flashing during fast navigation.
const RECENT_OPEN_DELAY_MS = 500;
const RECENT_MENU_GAP_PX = 16;

export const KiwiMenu = GObject.registerClass(
  class KiwiMenu extends PanelMenu.Button {
    _init(settings, extensionPath) {
      super._init(0.0, 'KiwiMenu');

  this._settings = settings;
  this._extensionPath = extensionPath;
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
        if (item.type === 'menu' && item.cmds?.includes('--logout')) {
          const title = fullName
            ? `Log Out ${fullName}...`
            : item.title;
          return {
            ...item,
            title,
            cmds: item.cmds ? [...item.cmds] : undefined,
          };
        }

        return {
          ...item,
          cmds: item.cmds ? [...item.cmds] : undefined,
        };
      });
    }

    _makeMenu(title, cmds) {
      const menuItem = new PopupMenu.PopupMenuItem(title);
      menuItem.connect('activate', () => Util.spawn(cmds));
      this.menu.addMenuItem(menuItem);
    }

    _makeRecentItemsMenu(title) {
      const submenuItem = new PopupMenu.PopupBaseMenuItem({
        reactive: true,
        can_focus: true,
        hover: true,
      });

      const label = new St.Label({
        text: title,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      submenuItem.add_child(label);

      const arrowIcon = new St.Icon({
        icon_name: 'go-next-symbolic',
        style_class: 'popup-menu-arrow',
        y_align: Clutter.ActorAlign.CENTER,
      });
      submenuItem.add_child(arrowIcon);

  let recentMenu = null;
  let recentMenuHoverActor = null;
  let recentMenuSignalIds = [];
  let recentMenuMenuSignalIds = [];
      let hoverCloseTimeoutId = 0;
  let openDelayTimeoutId = 0;
      let mainMenuCloseId = 0;
      let submenuDestroyId = 0;
      let chromeAdded = false;
      let managerRegistered = false;
      let recentMenuClosing = false;
      let mainMenuItemSignalIds = [];

      const populateMenu = (menu) => {
        menu.removeAll();

        const recentItems = this._getRecentItems();
        if (recentItems.length === 0) {
          const placeholder = new PopupMenu.PopupMenuItem('No recent items');
          placeholder.setSensitive(false);
          menu.addMenuItem(placeholder);
          return;
        }

        recentItems.forEach(({ title: itemTitle, uri }) => {
          const recentMenuItem = new PopupMenu.PopupMenuItem(itemTitle);
          recentMenuItem.connect('activate', () => {
            try {
              const context = global.create_app_launch_context(0, -1);
              Gio.AppInfo.launch_default_for_uri(uri, context);
            } catch (error) {
              logError(error, `Failed to open recent item: ${uri}`);
            }
            this.menu.close(true);
            closeAndDestroyRecentMenu();
          });
          menu.addMenuItem(recentMenuItem);
        });
      };

      const cancelClose = () => {
        if (hoverCloseTimeoutId) {
          GLib.source_remove(hoverCloseTimeoutId);
          hoverCloseTimeoutId = 0;
        }
      };

      const cancelOpenDelay = () => {
        if (openDelayTimeoutId) {
          GLib.source_remove(openDelayTimeoutId);
          openDelayTimeoutId = 0;
        }
      };

      const clearSubmenuHover = () => {
        if (typeof submenuItem.setActive === 'function') {
          submenuItem.setActive(false);
        }

        if (typeof submenuItem.remove_style_pseudo_class === 'function') {
          submenuItem.remove_style_pseudo_class('hover');
          submenuItem.remove_style_pseudo_class('active');
          submenuItem.remove_style_pseudo_class('checked');
        }

        if (submenuItem && submenuItem.actor) {
          const actor = submenuItem.actor;
          if (typeof actor.set_hover === 'function') {
            actor.set_hover(false);
          }
          if (typeof actor.remove_style_pseudo_class === 'function') {
            actor.remove_style_pseudo_class('hover');
            actor.remove_style_pseudo_class('active');
            actor.remove_style_pseudo_class('checked');
          }
        }
      };

      const scheduleClose = () => {
        cancelClose();
        hoverCloseTimeoutId = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          HOVER_CLOSE_DELAY_MS,
          () => {
            const pointerState = getPointerState();

            if (pointerState === PointerState.INSIDE) {
              hoverCloseTimeoutId = 0;
              return GLib.SOURCE_REMOVE;
            }

            if (pointerState === PointerState.BRIDGE) {
              return GLib.SOURCE_CONTINUE;
            }

            hoverCloseTimeoutId = 0;
            closeAndDestroyRecentMenu();
            clearSubmenuHover();
            return GLib.SOURCE_REMOVE;
          }
        );
        GLib.Source.set_name_by_id(hoverCloseTimeoutId, 'KiwiMenuHoverCloseDelay');
      };

      const scheduleOpen = () => {
        cancelOpenDelay();

        if (recentMenu && recentMenu.isOpen) {
          return;
        }

        openDelayTimeoutId = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          RECENT_OPEN_DELAY_MS,
          () => {
            openDelayTimeoutId = 0;
            const menu = ensureRecentMenu();
            menu.open(true);
            return GLib.SOURCE_REMOVE;
          }
        );
        GLib.Source.set_name_by_id(openDelayTimeoutId, 'KiwiMenuRecentOpenDelay');
      };

      const disconnectRecentMenuSignals = () => {
        recentMenuSignalIds.forEach(({ target, id }) => {
          if (target && id) {
            try {
              target.disconnect(id);
            } catch (_error) {
              // Ignore, signal already disconnected during teardown
            }
          }
        });
        recentMenuSignalIds = [];

        if (!recentMenu) {
          recentMenuMenuSignalIds = [];
          return;
        }

        recentMenuMenuSignalIds.forEach((id) => {
          if (id) {
            try {
              recentMenu.disconnect(id);
            } catch (_error) {
              // Ignore if already disconnected during teardown
            }
          }
        });
        recentMenuMenuSignalIds = [];
      };

      const disconnectMainMenuItemSignals = () => {
        mainMenuItemSignalIds.forEach(({ actor, signalId }) => {
          if (actor && signalId) {
            try {
              actor.disconnect(signalId);
            } catch (_error) {
              // Ignore if already disconnected during teardown
            }
          }
        });
        mainMenuItemSignalIds = [];
      };

      const connectMainMenuItemSignals = () => {
        disconnectMainMenuItemSignals();

        if (!this.menu || typeof this.menu._getMenuItems !== 'function') {
          return;
        }

        const menuItems = this.menu._getMenuItems();
        menuItems.forEach((item) => {
          if (!item || item === submenuItem) {
            return;
          }

          const actor = item.actor;
          if (!actor || actor === submenuItem.actor || !actor.reactive) {
            return;
          }

          actor.track_hover = true;
          const signalId = actor.connect('enter-event', () => {
            if (!recentMenu) {
              return Clutter.EVENT_PROPAGATE;
            }

            cancelClose();
            cancelOpenDelay();
            closeAndDestroyRecentMenu();
            clearSubmenuHover();
            return Clutter.EVENT_PROPAGATE;
          });

          mainMenuItemSignalIds.push({ actor, signalId });
        });
      };

      const ensureRecentMenu = () => {
        if (recentMenu) {
          populateMenu(recentMenu);
          connectMainMenuItemSignals();
          return recentMenu;
        }

        recentMenu = new PopupMenu.PopupMenu(submenuItem.actor, 0.0, St.Side.RIGHT);
        recentMenu.setArrowOrigin(0.0);
        recentMenu.actor.add_style_class_name('kiwi-recent-menu');
        if (recentMenu.actor.set_margin_left) {
          recentMenu.actor.set_margin_left(RECENT_MENU_GAP_PX);
        } else {
          recentMenu.actor.style = `margin-left: ${RECENT_MENU_GAP_PX}px;`;
        }
        recentMenu.actor.translation_x = RECENT_MENU_GAP_PX;
        recentMenu.actor.track_hover = true;
        recentMenu.actor.reactive = true;

        recentMenuHoverActor = recentMenu.box ?? recentMenu.actor;
        // Track hover on the visible menu box to detect real pointer exits.
        if (recentMenuHoverActor) {
          recentMenuHoverActor.track_hover = true;
          recentMenuHoverActor.reactive = true;
        }

        Main.layoutManager.addTopChrome(recentMenu.actor);
        chromeAdded = true;

        if (!managerRegistered && this._recentMenuManager) {
          this._recentMenuManager.addMenu(recentMenu);
          managerRegistered = true;
        }

        populateMenu(recentMenu);
        connectMainMenuItemSignals();

        recentMenuMenuSignalIds.push(
          recentMenu.connect('open-state-changed', (_, open) => {
            if (open) {
              cancelClose();
            } else {
              closeAndDestroyRecentMenu();
            }
          })
        );

        if (recentMenuHoverActor) {
          const enterId = recentMenuHoverActor.connect('enter-event', () => {
            cancelClose();
            cancelOpenDelay();
            return Clutter.EVENT_PROPAGATE;
          });
          recentMenuSignalIds.push({ target: recentMenuHoverActor, id: enterId });

          const leaveId = recentMenuHoverActor.connect('leave-event', () => {
            scheduleClose();
            return Clutter.EVENT_PROPAGATE;
          });
          recentMenuSignalIds.push({ target: recentMenuHoverActor, id: leaveId });
        }

        if (mainMenuCloseId === 0) {
          mainMenuCloseId = this.menu.connect('open-state-changed', (_, open) => {
            if (!open) {
              closeAndDestroyRecentMenu();
            }
          });
        }

        if (submenuDestroyId === 0) {
          submenuDestroyId = submenuItem.connect('destroy', () => {
            closeAndDestroyRecentMenu();
          });
        }

        return recentMenu;
      };

      const PointerState = {
        INSIDE: 0,
        BRIDGE: 1,
        OUTSIDE: 2,
      };
      const POINTER_TOLERANCE_PX = 8;

      const getActorBounds = (actor) => {
        if (!actor) {
          return null;
        }

        const [stageX, stageY] = actor.get_transformed_position();
        const [width, height] = actor.get_transformed_size();

        if (width === 0 || height === 0) {
          return null;
        }

        return {
          x1: stageX,
          y1: stageY,
          x2: stageX + width,
          y2: stageY + height,
        };
      };

      const getPointerState = () => {
        if (!recentMenu) {
          return PointerState.OUTSIDE;
        }

        const [pointerX, pointerY] = global.get_pointer();
        const submenuBounds = getActorBounds(submenuItem.actor);
        const recentBounds = getActorBounds(recentMenuHoverActor ?? recentMenu.actor);

        const pointWithin = (bounds, tolerance = 0) =>
          bounds &&
          pointerX >= bounds.x1 - tolerance &&
          pointerX <= bounds.x2 + tolerance &&
          pointerY >= bounds.y1 - tolerance &&
          pointerY <= bounds.y2 + tolerance;

        if (
          pointWithin(submenuBounds, POINTER_TOLERANCE_PX) ||
          pointWithin(recentBounds, POINTER_TOLERANCE_PX)
        ) {
          return PointerState.INSIDE;
        }

        if (!submenuBounds || !recentBounds) {
          return PointerState.OUTSIDE;
        }

        const bridgeX1 = Math.min(submenuBounds.x2, recentBounds.x1);
        const bridgeX2 = Math.max(submenuBounds.x2, recentBounds.x1);
        const overlapTop = Math.max(submenuBounds.y1, recentBounds.y1);
        const overlapBottom = Math.min(submenuBounds.y2, recentBounds.y2);

        if (overlapBottom >= overlapTop) {
          // Allow a narrow horizontal bridge between the submenu and popup.
          // Require the pointer to stay near or to the right of the submenu edge
          // so sliding back to the main menu exits the bridge promptly.
          const submenuRight = submenuBounds.x2;
          const recentLeft = recentBounds.x1;
          const gapWidth = Math.max(0, bridgeX2 - bridgeX1);
          const leftTolerance = Math.min(4, gapWidth);
          const rightTolerance = POINTER_TOLERANCE_PX;

          if (
            pointerX >= submenuRight - leftTolerance &&
            pointerX <= recentLeft + rightTolerance &&
            pointerY >= overlapTop - POINTER_TOLERANCE_PX &&
            pointerY <= overlapBottom + POINTER_TOLERANCE_PX
          ) {
            return PointerState.BRIDGE;
          }
        }

        return PointerState.OUTSIDE;
      };

      const closeAndDestroyRecentMenu = () => {
        cancelOpenDelay();

        if (!recentMenu || recentMenuClosing) {
          clearSubmenuHover();
          return;
        }

        recentMenuClosing = true;

        try {
          cancelClose();

          if (mainMenuCloseId !== 0) {
            this.menu.disconnect(mainMenuCloseId);
            mainMenuCloseId = 0;
          }

          if (submenuDestroyId !== 0) {
            try {
              submenuItem.disconnect(submenuDestroyId);
            } catch (_error) {
              // Signal was already disconnected, ignore
            }
            submenuDestroyId = 0;
          }

          disconnectRecentMenuSignals();
          disconnectMainMenuItemSignals();

          if (recentMenu.isOpen) {
            recentMenu.close(true);
          }

          if (managerRegistered && this._recentMenuManager) {
            this._recentMenuManager.removeMenu(recentMenu);
            managerRegistered = false;
          }

          if (chromeAdded) {
            Main.layoutManager.removeChrome(recentMenu.actor);
            chromeAdded = false;
          }

          recentMenu.destroy();
          recentMenu = null;
          recentMenuHoverActor = null;
          clearSubmenuHover();
        } finally {
          recentMenuClosing = false;
        }
      };

      submenuItem.actor.connect('enter-event', () => {
        cancelClose();
        scheduleOpen();
        return Clutter.EVENT_PROPAGATE;
      });

      submenuItem.actor.connect('leave-event', () => {
        cancelOpenDelay();
        scheduleClose();
        return Clutter.EVENT_PROPAGATE;
      });

      submenuItem.actor.connect('button-press-event', () => {
        cancelClose();
        cancelOpenDelay();
        const menu = ensureRecentMenu();
        menu.open(true);
        return Clutter.EVENT_STOP;
      });

      submenuItem.connect('activate', () => {
        cancelClose();
        cancelOpenDelay();
        const menu = ensureRecentMenu();
        menu.open(true);
      });

      this.menu.addMenuItem(submenuItem);
    }

    _makeSeparator() {
      const separator = new PopupMenu.PopupSeparatorMenuItem();
      this.menu.addMenuItem(separator);
    }

    _getRecentItems() {
      const file = Gio.File.new_for_path(RECENT_ITEMS_FILE);
      if (!file.query_exists(null)) {
        return [];
      }

      let contents;
      try {
        [, contents] = file.load_contents(null);
      } catch (error) {
        logError(error, 'Failed to read recent items list');
        return [];
      }

      const text = new TextDecoder().decode(contents);
      const regex = /<bookmark[^>]*href="([^"]+)"[^>]*modified="([^"]+)"[^>]*>([\s\S]*?<title>([^<]*)<\/title>)?/g;
      const items = [];
      const seenUris = new Set();

      let match;
      while ((match = regex.exec(text)) !== null) {
        const uri = match[1];
        const modified = match[2];
        const titleMarkup = match[4] ?? '';

        if (seenUris.has(uri)) {
          continue;
        }
        seenUris.add(uri);

        let timestamp = 0;
        try {
          const dateTime = GLib.DateTime.new_from_iso8601(modified, null);
          if (dateTime) {
            timestamp = dateTime.to_unix();
          }
        } catch (error) {
          logError(error, `Failed to parse modified time for ${uri}`);
        }

        let title = titleMarkup.trim();
        if (!title) {
          const decodedUri = GLib.uri_unescape_string(uri, null) ?? uri;
          if (decodedUri.startsWith('file://')) {
            const filePath = decodedUri.substring('file://'.length);
            title = GLib.path_get_basename(filePath);
          } else {
            title = decodedUri;
          }
        }

        items.push({
          title,
          uri,
          timestamp,
        });
      }

      items.sort((a, b) => b.timestamp - a.timestamp);

      return items.slice(0, MAX_RECENT_ITEMS);
    }
  }
);
