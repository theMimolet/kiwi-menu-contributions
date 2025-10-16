# Kiwi Menu

Kiwi Menu is a macOS-inspired menu bar for GNOME Shell. It replaces the Activities button with a compact launcher that exposes common system actions, session controls, and user shortcuts in a familiar dropdown menu.

## Features

- macOS-style panel menu with GNOME-friendly styling
- Customizable menu icon with multiple bundled glyphs
- Optional hiding of the default Activities button
- Quick launchers for session actions such as lock, logout, restart, and power off
- Recent items popup that opens adjacent to the panel button
- Preferences window that remembers its size between sessions

## Requirements

- GNOME Shell 48 or 49 (as declared in `metadata.json`)
- GLib schema compilation tools (`glib-compile-schemas`)

## Installation

### From Source (local checkout)

1. Clone the repository alongside your Shell extension directory:
   ```bash
   git clone https://github.com/kem-a/kiwimenu-kemma.git
   ```
2. Compile the GSettings schema:
   ```bash
   glib-compile-schemas schemas
   ```
3. Create a symlink into your local extensions folder:
   ```bash
   ln -s "$(pwd)" "$HOME/.local/share/gnome-shell/extensions/kiwimenu@kemma"
   ```
4. Reload GNOME Shell (Alt+F2, enter `r`, press Enter) or log out and back in.
5. Enable **Kiwi Menu** with `gnome-extensions-app` or `gnome-extensions enable kiwimenu@kemma`.

## Preferences

Open **Kiwi Menu** in the Extensions app to adjust:

- **Menu Icon** – pick from the bundled icon set.
- **Hide Activities Menu** – toggle the Activities button visibility.

The preferences window stores its last width and height via GSettings, so the next launch restores your layout.

## Development

- Source code lives in `extension.js`, with supporting modules in `src/`.
- Preferences UI resides in `prefs.js` and `preferences/`.
- Update the schema in `schemas/org.gnome.shell.extensions.kiwimenu.gschema.xml` and re-run `glib-compile-schemas schemas` whenever you add new settings keys.

### Testing Changes

1. Make edits.
2. Recompile the schema if necessary.
3. Reload GNOME Shell or run:
   ```bash
   gnome-extensions disable kiwimenu@kemma
   gnome-extensions enable kiwimenu@kemma
   ```
4. Inspect GNOME Logs (`journalctl --user-unit gnome-shell -f`) for runtime warnings.

## Contributing

Issues and pull requests are welcome. Please describe the environment you tested on and include steps to reproduce any problems.

## License

Refer to the repository's license file or contact the maintainers for licensing details.
