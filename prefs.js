/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * prefs.js - Implements the preferences UI for the Kiwi Menu extension.
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function loadIconsMetadata(sourcePath) {
  const textDecoder = new TextDecoder();
  const filePath = GLib.build_filenamev([
    sourcePath,
    'src',
    'icons.json',
  ]);

  try {
    const file = Gio.File.new_for_path(filePath);
    const [, contents] = file.load_contents(null);
    const data = JSON.parse(textDecoder.decode(contents));
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logError(error, `Failed to load icons metadata from ${filePath}`);
    return [];
  }
}

const OptionsPage = GObject.registerClass(
  class OptionsPage extends Adw.PreferencesPage {
    constructor(settings, sourcePath, gettextFunc) {
      super({
        title: gettextFunc('Options'),
        icon_name: 'preferences-other-symbolic',
        name: 'OptionsPage',
      });

      this._settings = settings;
      this._ = gettextFunc;

      const icons = loadIconsMetadata(sourcePath);

      const menuGroup = new Adw.PreferencesGroup({
        title: this._('Menu'),
        description: this._('Adjust how the Kiwi Menu looks and behaves.'),
      });

      const iconsList = new Gtk.StringList();
      icons.forEach((icon) => iconsList.append(icon.title));

      const iconSelectorRow = new Adw.ComboRow({
        title: this._('Menu Icon'),
        subtitle: this._('Choose the icon to display in the panel.'),
        model: iconsList,
        selected: this._settings.get_int('icon'),
      });

      menuGroup.add(iconSelectorRow);

      const defaultAppStoreCommand = 'gnome-software';
      const appStoreCommandRow = new Adw.EntryRow({
        title: this._('App Store Command'),
      });
      appStoreCommandRow.set_subtitle?.(
        this._('Command launched when opening the App Store menu item.')
      );
      appStoreCommandRow.set_placeholder_text?.(defaultAppStoreCommand);
      appStoreCommandRow.set_text(this._settings.get_string('app-store-command'));

      const restoreButton = new Gtk.Button({
        icon_name: 'edit-undo-symbolic',
        has_frame: false,
        tooltip_text: this._('Restore Default'),
        valign: Gtk.Align.CENTER,
      });
      restoreButton.add_css_class?.('circular');

      const acceptButton = new Gtk.Button({
        icon_name: 'emblem-ok-symbolic',
        has_frame: false,
        tooltip_text: this._('Apply Changes'),
        valign: Gtk.Align.CENTER,
      });
      acceptButton.add_css_class?.('circular');
      acceptButton.set_visible(false);
      acceptButton.set_sensitive(false);

      appStoreCommandRow.add_suffix?.(acceptButton);
      appStoreCommandRow.add_suffix?.(restoreButton);

      const clearEntryFocus = () => {
        const root = appStoreCommandRow.get_root?.();
        if (root && typeof root.set_focus === 'function') {
          root.set_focus(null);
        }
      };

      const updateRestoreButtonState = () => {
        const currentText = appStoreCommandRow.get_text
          ? appStoreCommandRow.get_text()
          : appStoreCommandRow.text ?? '';
        const isDefault = currentText.trim() === defaultAppStoreCommand;
        restoreButton.set_sensitive(!isDefault);
        restoreButton.set_visible(!isDefault);
        acceptButton.set_sensitive(!isDefault);
      };

      restoreButton.connect('clicked', () => {
        appStoreCommandRow.set_text(defaultAppStoreCommand);
        clearEntryFocus();
      });

      acceptButton.connect('clicked', () => {
        clearEntryFocus();
      });

      appStoreCommandRow.connect('notify::text', updateRestoreButtonState);
      updateRestoreButtonState();

      const keyController = new Gtk.EventControllerKey();
      keyController.connect('key-pressed', (controller, keyval) => {
        if (keyval === Gdk.KEY_Escape) {
          clearEntryFocus();
          return true;
        }
        return false;
      });
      appStoreCommandRow.add_controller?.(keyController);

      const focusController = new Gtk.EventControllerFocus();
      focusController.connect('enter', () => {
        acceptButton.set_visible(true);
      });
      focusController.connect('leave', () => {
        acceptButton.set_visible(false);
      });
      appStoreCommandRow.add_controller?.(focusController);

      menuGroup.add(appStoreCommandRow);

      const behaviorGroup = new Adw.PreferencesGroup({
        title: this._('Panel'),
        description: this._('Hide or show the Activities button from the top bar.'),
      });

      const activityMenuSwitch = new Gtk.Switch({
        valign: Gtk.Align.CENTER,
        active: !this._settings.get_boolean('activity-menu-visibility'),
      });

      const activityMenuRow = new Adw.ActionRow({
        title: this._('Hide Activities Menu'),
        subtitle: this._('Display the Activities button in the top panel.'),
        activatable_widget: activityMenuSwitch,
      });
      activityMenuRow.add_suffix(activityMenuSwitch);

      behaviorGroup.add(activityMenuRow);

      this.add(menuGroup);
      this.add(behaviorGroup);

      const quickSettingsGroup = new Adw.PreferencesGroup({
        title: this._('Quick Settings'),
        description: this._('Choose which default quick action buttons stay visible.'),
      });

      const quickActionToggles = [
        {
          key: 'hide-lock-button',
          title: this._('Hide Lock Screen Button'),
          subtitle: this._('Remove the lock screen quick action button.'),
        },
        {
          key: 'hide-power-button',
          title: this._('Hide Power Button'),
          subtitle: this._('Remove the power menu quick action button.'),
        },
        {
          key: 'hide-settings-button',
          title: this._('Hide Settings Button'),
          subtitle: this._('Remove the settings shortcut quick action button.'),
        },
      ];

      quickActionToggles.forEach(({ key, title, subtitle }) => {
        const toggle = new Gtk.Switch({
          valign: Gtk.Align.CENTER,
          active: this._settings.get_boolean(key),
        });

        const row = new Adw.ActionRow({
          title,
          subtitle,
          activatable_widget: toggle,
        });
        row.add_suffix(toggle);

        quickSettingsGroup.add(row);

        toggle.connect('notify::active', (widget) => {
          this._settings.set_boolean(key, widget.get_active());
        });
      });

      this.add(quickSettingsGroup);

      iconSelectorRow.connect('notify::selected', (widget) => {
        this._settings.set_int('icon', widget.selected);
      });

      this._settings.bind(
        'app-store-command',
        appStoreCommandRow,
        'text',
        Gio.SettingsBindFlags.DEFAULT
      );

      activityMenuSwitch.connect('notify::active', (widget) => {
        this._settings.set_boolean('activity-menu-visibility', !widget.get_active());
      });

    }
  }
);

export default class KiwiMenuPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    window._settings = settings;
    window.title = this.metadata.name ?? 'Kiwi Menu';
    window.set_default_size(450, 700);
    window.set_size_request(400, 550);
    window.set_search_enabled(true);
    this._ensureVersionCss(window);

    const _ = this.gettext.bind(this);
    const aboutPage = this._createAboutPage(window, _);
    const optionsPage = new OptionsPage(settings, this.path, _);

    window.add(aboutPage);
    window.add(optionsPage);
  }

  _ensureVersionCss(window) {
    if (window._kiwimenuVersionCssProvider)
      return;

    const cssProvider = new Gtk.CssProvider();
    cssProvider.load_from_data(
      `
        .kiwimenu-version-pill {
          padding: 6px 14px;
          min-height: 0;
          border-radius: 999px;
          border: none;
          background-color: alpha(@accent_bg_color, 0.18);
          color: @accent_color;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .kiwimenu-version-pill:hover {
          background-color: alpha(@accent_bg_color, 0.26);
        }

        .kiwimenu-version-pill:active {
          background-color: alpha(@accent_bg_color, 0.34);
        }
      `,
      -1
    );

    const display = Gdk.Display.get_default();
    if (display)
      Gtk.StyleContext.add_provider_for_display(
        display,
        cssProvider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
      );

    window._kiwimenuVersionCssProvider = cssProvider;
  }

  _createAboutPage(window, _) {
    const aboutPage = new Adw.PreferencesPage({
      title: _('About'),
      icon_name: 'help-about-symbolic',
      name: 'AboutPage',
    });

    const headerGroup = new Adw.PreferencesGroup();
    const headerBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 12,
      margin_top: 24,
      margin_bottom: 8,
      margin_start: 16,
      margin_end: 16,
      halign: Gtk.Align.CENTER,
    });

    const iconPath = GLib.build_filenamev([this.path ?? '.', 'src', 'kiwimenu.png']);
    const iconFile = Gio.File.new_for_path(iconPath);
    if (iconFile.query_exists(null)) {
      const logoImage = new Gtk.Picture({
        file: iconFile,
        width_request: 128,
        height_request: 128,
        content_fit: Gtk.ContentFit.CONTAIN,
        halign: Gtk.Align.CENTER,
      });
      headerBox.append(logoImage);
    }

    const extensionName = this.metadata.name ?? 'Kiwi Menu';
    headerBox.append(
      new Gtk.Label({
        label: `<span size="xx-large" weight="bold">${extensionName}</span>`,
        use_markup: true,
        halign: Gtk.Align.CENTER,
      })
    );

    headerBox.append(
      new Gtk.Label({
        label: 'Arnis Kemlers (kem-a)',
        halign: Gtk.Align.CENTER,
      })
    );

    const rawVersionName = this.metadata['version-name'] ?? null;
    const versionNumber =
      this.metadata.version !== undefined && this.metadata.version !== null
        ? `${this.metadata.version}`
        : null;
    const versionLabel =
      rawVersionName && versionNumber
        ? `${rawVersionName} (${versionNumber})`
        : rawVersionName ?? versionNumber ?? 'Unknown';
    const releaseVersion = rawVersionName ?? versionNumber;

    const versionButton = new Gtk.Button({
      label: versionLabel,
      halign: Gtk.Align.CENTER,
      margin_top: 4,
      tooltip_text: 'View release notes',
    });
    versionButton.add_css_class('pill');
    versionButton.add_css_class('kiwimenu-version-pill');

    const baseUrl = this.metadata.url ?? 'https://github.com/kem-a/kiwimenu-kemma';
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
    const releasesBaseUrl = normalizedBaseUrl.endsWith('/releases')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/releases`;

    versionButton.connect('clicked', () => {
      let targetUrl = releasesBaseUrl;
      if (releaseVersion && releaseVersion !== 'Unknown') {
        const safeVersion = encodeURIComponent(releaseVersion);
        targetUrl = `${releasesBaseUrl}/tag/v${safeVersion}`;
      }

      this._launchUri(window, targetUrl);
    });

    headerBox.append(versionButton);

    headerGroup.add(headerBox);
    aboutPage.add(headerGroup);

    const linksGroup = new Adw.PreferencesGroup();

    linksGroup.add(
      this._createLinkRow(
        window,
        _('Website'),
        normalizedBaseUrl
      )
    );

    aboutPage.add(linksGroup);

    const issuesGroup = new Adw.PreferencesGroup();

    issuesGroup.add(
      this._createLinkRow(
        window,
        _('Report an Issue'),
        `${normalizedBaseUrl}/issues`
      )
    );

    aboutPage.add(issuesGroup);

    const legalGroup = new Adw.PreferencesGroup();

    legalGroup.add(
      this._createLinkRow(
        window,
        _('Credits'),
        `${normalizedBaseUrl}/graphs/contributors`
      )
    );
    legalGroup.add(
      this._createLegalRow(window, normalizedBaseUrl, _)
    );

    aboutPage.add(legalGroup);

    return aboutPage;
  }

  _createLinkRow(window, title, url) {
    const row = new Adw.ActionRow({
      title,
      activatable: true,
    });

    row.add_suffix(new Gtk.Image({ icon_name: 'external-link-symbolic' }));
    row.connect('activated', () => {
      this._launchUri(window, url);
    });

    return row;
  }

  _createLegalRow(window, baseUrl, _) {
    const row = new Adw.ActionRow({
      title: _('Legal'),
      activatable: true,
    });
    row.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));
    row.connect('activated', () => {
      this._openLegalDialog(window, baseUrl, _);
    });
    return row;
  }

  _openLegalDialog(window, baseUrl, _) {
    const dialog = new Adw.Dialog({
      content_width: 420,
      content_height: 560,
      presentation_mode: Adw.DialogPresentationMode.BOTTOM_SHEET,
    });

    const toolbarView = new Adw.ToolbarView();
    const headerBar = new Adw.HeaderBar({
      show_title: true,
      title_widget: new Adw.WindowTitle({ title: _('Legal') }),
    });
    toolbarView.add_top_bar(headerBar);

    const legalPage = new Adw.PreferencesPage();

    const licenseGroup = new Adw.PreferencesGroup({
      title: _('License'),
      description: _('Kiwi Menu is free and open source software.'),
    });
    licenseGroup.add(
      this._createLinkRow(
        window,
        _('GNU General Public License v3.0'),
        `${baseUrl}/blob/main/LICENSE`
      )
    );
    legalPage.add(licenseGroup);

    const copyrightGroup = new Adw.PreferencesGroup({
      title: _('Copyright'),
      description: _('Copyright © 2025 Arnis Kemlers. Licensed under the terms of the GNU General Public License version 3 or later.'),
    });
    legalPage.add(copyrightGroup);

    const scroller = new Gtk.ScrolledWindow({ vexpand: true, hexpand: true });
    scroller.set_child(legalPage);
    toolbarView.set_content(scroller);
    dialog.set_child(toolbarView);

    dialog.present(window);
  }

  _launchUri(window, url) {
    try {
      Gtk.show_uri(window, url, Gdk.CURRENT_TIME);
    } catch (error) {
      logError(error, `Failed to open URI ${url}`);
    }
  }
}
