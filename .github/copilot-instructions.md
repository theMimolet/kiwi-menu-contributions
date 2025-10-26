# Copilot Instructions for Kiwi Menu

Welcome to the Kiwi Menu codebase! This document provides essential guidelines for AI coding agents to be productive in this project. Kiwi Menu is a GNOME Shell extension inspired by macOS, offering a compact and customizable menu bar.

## Project Overview
- **Purpose**: Replace the GNOME Activities button with a macOS-style menu bar.
- **Key Features**:
  - Customizable menu icon.
  - Quick access to session actions (lock, logout, restart, etc.).
  - Recent items popup.
  - Preferences window with persistent layout.
- **Architecture**:
  - Core functionality resides in `extension.js`.
  - Supporting modules are in `src/`.
  - Preferences UI is implemented in `prefs.js`.
  - GSettings schema is defined in `schemas/org.gnome.shell.extensions.kiwimenu.gschema.xml`.

## Developer Workflows

### Setting Up the Extension
1. Clone the repository:
   ```bash
   git clone https://github.com/kem-a/kiwimenu-kemma.git
   ```
2. Compile the GSettings schema:
   ```bash
   glib-compile-schemas schemas
   ```
3. Create a symlink to the GNOME extensions directory:
   ```bash
   ln -s "$(pwd)" "$HOME/.local/share/gnome-shell/extensions/kiwimenu@kemma"
   ```
4. Reload GNOME Shell:
   - Press `Alt+F2`, type `r`, and press Enter.
   - Alternatively, log out and back in.
5. Enable the extension:
   ```bash
   gnome-extensions enable kiwimenu@kemma
   ```

### Testing Changes
1. Make edits to the code.
2. Recompile the schema if necessary:
   ```bash
   glib-compile-schemas schemas
   ```
3. Reload the extension:
   ```bash
   gnome-extensions disable kiwimenu@kemma
   gnome-extensions enable kiwimenu@kemma
   ```
4. Check GNOME Logs for runtime warnings:
   ```bash
   journalctl --user-unit gnome-shell -f
   ```

## Codebase Conventions
- **File Organization**:
  - `extension.js`: Entry point for the extension.
  - `src/`: Contains supporting modules like `kiwimenu.js` and `forceQuitOverlay.js`.
  - `prefs.js`: Manages the preferences UI.
  - `schemas/`: Stores the GSettings schema.
- **Schema Updates**:
  - Modify `schemas/org.gnome.shell.extensions.kiwimenu.gschema.xml` for new settings.
  - Recompile the schema after changes.
- **Styling**:
  - CSS for the menu is in `stylesheet.css`.

## External Dependencies
- **GNOME Shell**: Version 48 or 49.
- **GLib Schema Compilation Tools**: Required for schema updates.

## Tips for AI Agents
- Follow the GNOME Shell extension development guidelines.
- Use `journalctl` to debug runtime issues.
- Ensure schema changes are reflected by recompiling and reloading the extension.

For further details, refer to the [README.md](../README.md) file.

# GNOME Shell Extensions Review Guidelines - Key Points

## Critical Rules to Check:

### 1. Initialization and Cleanup

- **RULE**: Don't create/modify anything before `enable()` is called
- **RULE**: Use `enable()` to create objects, connect signals, add main loop sources
- **RULE**: Use `disable()` to cleanup everything done in `enable()`

### 2. Object Management

- **RULE**: Destroy all objects in `disable()` - any GObject classes must be destroyed
- **RULE**: Disconnect all signal connections in `disable()`
- **RULE**: Remove all main loop sources in `disable()`
  - Track every `GLib.timeout_add`, `GLib.idle_add`, `GLib.interval_add`, `Mainloop.timeout_add`, `imports.misc.util.setTimeout`, etc.
  - Store returned source IDs in module/class fields (e.g. `this._timeoutId`, array) and clear them in `disable()` / `destroy()` with `GLib.source_remove(id)` (or `GLib.Source.remove(id)` depending on API style) then null out the reference.
  - If a repeating source returns `GLib.SOURCE_CONTINUE`, ensure you remove it explicitly on cleanup.
  - Never leave anonymous timeouts untracked.

### 3. Import Restrictions

- **RULE**: Do not use deprecated modules (ByteArray, Lang, Mainloop)
- **RULE**: Do not import GTK libraries (Gdk, Gtk, Adw) in GNOME Shell process
- **RULE**: Do not import GNOME Shell libraries (Clutter, Meta, St, Shell) in preferences

### 4. Code Quality

- **RULE**: Code must not be obfuscated or minified
- **RULE**: No excessive logging
- **RULE**: Use modern ES6 features, avoid deprecated patterns
- **RULE**: Avoid unnecessary try and catch blocks

### 5. Common Issues to Look For:

- Unused imports/declarations
- Variables declared but not properly cleaned up
- Signal connections without disconnection
- Objects created but not destroyed
- Main loop sources not removed
- Static resources created during initialization instead of enable()

## What to Check in Each File:

1. ✅ Are all imports actually used?
2. ✅ Are objects properly destroyed in disable()?
3. ✅ Are signal connections properly disconnected?
4. ✅ Are main loop sources properly removed?
5. ✅ No deprecated modules?
6. ✅ No object creation during initialization?
7. ✅ Proper ES6 usage?
8. ✅ EVERY timeout/idle/interval tracked & removed? (Search: `timeout_add`, `idle_add`, `SOURCE_CONTINUE`)
9. ✅ No lingering source IDs after disable? (Manually invoke enable/disable cycle in review)

### Quick Audit Procedure (Never Skip):

1. Grep: `grep -R "timeout_add\|idle_add\|SOURCE_CONTINUE" apps/` and ensure each result stores an ID.
2. Verify each stored ID is removed in `disable()` / `destroy()` (or via an intermediate cleanup function).
3. For classes: confirm `destroy()` clears all sources before calling `super.destroy()`.
4. For modules: confirm `disable()` clears module-level arrays/maps of sources.
5. If a timeout self-clears (one-shot returning `SOURCE_REMOVE`) still track it if created conditionally so you can cancel it when disabling early.

If ANY source isn’t tracked, BLOCK MERGE until fixed.


# GNOME Shell Extensions Review Guidelines
TIP

If this is your first time writing an extension, please see the [Getting Started](https://gjs.guide/extensions/development/creating.html) guide.

These are the guidelines for developers who would like their extensions distributed on the [extensions.gnome.org](https://extensions.gnome.org/). Extensions are reviewed carefully for malicious code, malware and security risks, but not for bugs.

## General Guidelines

There are three basic guidelines for the operation of an extension:

1. Don't create or modify anything before `enable()` is called
2. Use `enable()` to create objects, connect signals and add main loop sources
3. Use `disable()` to cleanup anything done in `enable()`

These general tips will help your extension pass review:

- Write clean code, with consistent indentation and style
- Use modern features like ES6 classes and `async`/`await`
- Use a linter to check for logic and syntax errors
- Ask other developers for advice on [Matrix](https://matrix.to/#/#extensions:gnome.org)

## Rules

### Only use initialization for static resources

Extensions **MUST NOT** create any objects, connect any signals, add any main loop sources or modify GNOME Shell during initialization.

In GNOME 45 and later, initialization happens when `extension.js` is imported and the `Extension` class is constructed (e.g. `constructor()` is called).

GNOME Shell 45 and later

js

```
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ExampleExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        // DO NOT create objects, connect signals or add main loop sources here
    }

    enable() {
        // Create objects, connect signals, create main loop sources, etc.
    }

    disable() {
        // Destroy objects, disconnect signals, remove main loop sources, etc.
    }
}
```

In GNOME 44 and earlier, initialization happens when `extension.js` is imported and the `init()` function is called. When using the `Extension` class pattern, the `constructor()` is also called.

GNOME Shell 44 and earlier

js

```
const ExtensionUtils = imports.misc.extensionUtils;

class Extension {
    constructor() {
        // DO NOT create objects, connect signals or add main loop sources here
    }

    enable() {
        // Create objects, connect signals, create main loop sources, etc.
    }

    disable() {
        // Destroy objects, disconnect signals, remove main loop sources, etc.
    }
}

function init() {
    // Initialize translations before returning the extension object
    ExtensionUtils.initTranslations();

    return new Extension();
}
```

Extensions **MAY** create static data structures and instances of built-in JavaScript objects (such as `Regexp()` and `Map()`), but all dynamically stored memory must be cleared or freed in `disable()` (e.g. `Map.prototype.clear()`). All GObject classes, such as `Gio.Settings` and `St.Widget` are disallowed.

Static Objects

js

```
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Extensions **MAY** construct built-in JavaScript types in the module scope
const FoobarCache = new Map();

// Extensions **MAY** create static data structures in the module scope
const FoobarState = {
    DEFAULT: 0,
    CHANGED: 1,
};

class Foobar {
    state = FoobarState.DEFAULT;
}

let DEFAULT_FOOBAR = null;

export default class ExampleExtension extends Extension {
    constructor(metadata) {
        super(metadata);

        // Extensions **MAY** create and store a reasonable amount of static
        // data during initialization
        this._state = {
            enabled: false,
        };
    }

    enable() {
        // Extensions **MAY** construct instances of classes and assign them
        // to variables in the module scope
        if (DEFAULT_FOOBAR === null)
            DEFAULT_FOOBAR = new Foobar();

        // Extensions **MAY** dynamically store data in the module scope
        for (let i = 0; i < 10; i++)
            FoobarCache.set(`${i}`, new Date());

        this._state.enabled = true;
    }

    disable() {
        // Extensions **MUST** destroy instances of classes assigned to
        // variables in the module scope
        if (DEFAULT_FOOBAR instanceof Foobar)
            DEFAULT_FOOBAR = null;

        // Extensions **MUST** clear dynamically stored data in the module scope
        FoobarCache.clear();

        this._state.enabled = false;
    }
}
```

### Destroy all objects

Any objects or widgets created by an extension **MUST** be destroyed in `disable()`.

GNOME 45 and later

js

```
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ExampleExtension extends Extension {
    enable() {
        this._widget = new St.Widget();
    }

    disable() {
        this._widget?.destroy();
        this._widget = null;
    }
}
```

GNOME 44 and earlier

js

```
const St = imports.gi.St;

class Extension {
    enable() {
        this._widget = new St.Widget();
    }

    disable() {
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
    }
}

function init() {
    return new Extension();
}
```

### Disconnect all signals

Any signal connections made by an extension **MUST** be disconnected in `disable()`:

GNOME 45 and later

js

```
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ExampleExtension extends Extension {
    enable() {
        this._handlerId = global.settings.connect('changed::favorite-apps', () => {
            console.log('app favorites changed');
        });
    }

    disable() {
        if (this._handlerId) {
            global.settings.disconnect(this._handlerId);
            this._handlerId = null;
        }
    }
}
```

GNOME 44 and earlier

js

```
class Extension {
    enable() {
        this._handlerId = global.settings.connect('changed::favorite-apps', () => {
            console.log('app favorites changed');
        });
    }

    disable() {
        if (this._handlerId) {
            global.settings.disconnect(this._handlerId);
            this._handlerId = null;
        }
    }
}

function init() {
    return new Extension();
}
```

### Remove main loop sources

Any main loop sources created **MUST** be removed in `disable()`.

Note that all sources **MUST** be removed in `disable()`, even if the callback function will eventually return `false` or `GLib.SOURCE_REMOVE`.

GNOME 45 and later

js

```
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class ExampleExtension extends Extension {
    enable() {
        this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            console.log('Source triggered');

            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._sourceId) {
            GLib.Source.remove(this._sourceId);
            this._sourceId = null;
        }
    }
}
```

GNOME 44 and earlier

js

```
const GLib = imports.gi.GLib;

class Extension {
    enable() {
        this._sourceId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            console.log('Source triggered');

            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._sourceId) {
            GLib.Source.remove(this._sourceId);
            this._sourceId = null;
        }
    }
}

function init() {
    return new Extension();
}
```

### Do not use deprecated modules

Extensions **MUST NOT** import deprecated modules.

| Deprecated Module | Replacement |
| --- | --- |
| `ByteArray` | [`TextDecoder`](https://gjs-docs.gnome.org/gjs/encoding.md#textdecoder) and [`TextEncoder`](https://gjs-docs.gnome.org/gjs/encoding.md#textencoder) |
| `Lang` | [ES6 Classes](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Classes) and [`Function.prototype.bind()`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Function/bind) |
| `Mainloop` | [`GLib.timeout_add()`](https://gjs-docs.gnome.org/glib20/glib.timeout_add), [`setTimeout()`](https://developer.mozilla.org/docs/Web/API/Window/setTimeout), etc |

### Do not import GTK libraries in GNOME Shell

Extensions **MUST NOT** import `Gdk`, `Gtk` or `Adw` in the GNOME Shell process.

These libraries are only for use in the preferences process (`prefs.js`) and will conflict with `Clutter` and other libraries used by GNOME Shell.

### Do not import GNOME Shell libraries in Preferences

Extensions **MUST NOT** import `Clutter`, `Meta`, `St` or `Shell` in the preferences process.

These libraries are only for use in the GNOME Shell process (`extension.js`) and will conflict with `Gtk` and other libraries.

### Avoid interfering with the Extension System

Extensions which modify, reload or interact with other extensions or the extension system are generally discouraged.

While not strictly prohibited, these extensions will be reviewed on a case-by-case basis and may be rejected at the reviewer's discretion.

### Code must not be obfuscated

Extension code **MUST** be readable and reviewable JavaScript.

A specific code-style is not enforced, however submitted code must be formatted in a way that can be easily reviewed. The following rules **MUST** be adhered to:

- JavaScript code must be readable and reasonably structured
- JavaScript code must not be minified or obfuscated
- TypeScript must be transpiled to well-formatted JavaScript

### No excessive logging

Extension **MUST NOT** print excessively to the log. The log should only be used for important messages and errors.

If a reviewer determines that an extension is writing excessively to the log, the extension will be rejected.

### Extensions should not force dispose a GObject

Extensions **SHOULD NOT** call [`GObject.Object.run_dispose()`](https://gjs-docs.gnome.org/gobject20/gobject.object#method-run_dispose) unless absolutely necessary.

If absolutely necessary, any call to this method **MUST** have a comment explaining the real-world situation that makes it a requirement.

### Scripts and Binaries

Use of external scripts and binaries is strongly discouraged. In cases where this is unavoidable for the extension to serve it's purpose, the following rules must be adhered to:

- Extensions **MUST NOT** include binary executables or libraries
- Processes **MUST** be spawned carefully and exit cleanly
- Scripts **MUST** be written in GJS, unless absolutely necessary
- Scripts must be distributed under an OSI approved license

Reviewing Python modules, HTML, and web [JavaScript](https://wiki.gnome.org/JavaScript) dependencies is out of scope for extensions.gnome.org. Unless required functionality is only available in another scripting language, scripts must be written in GJS.

Extensions may install modules from well-known services such as `pip`, `npm` or `yarn` but **MUST** require explicit user action. For example, the extension preferences may include a page which describes the modules to be installed with a button.

### Clipboard Access must be declared

Extensions that access the clipboard, with or without user interaction, **MUST** declare it in the description.

An extension **MUST NOT** share clipboard data with a third-party without explicit user interaction (e.g. button click, a user-defined keyboard shortcut).

An extension **MUST NOT** ship with default keyboard shortcuts for interacting with clipboard data.

### Privileged Subprocess must not be user-writable

Spawning privileged subprocesses should be avoided at all costs.

If absolutely necessary, the subprocess **MUST** be run with `pkexec` and **MUST NOT** be an executable or script that can be modified by a user process.

### Extensions must be functional

Extensions are reviewed, but not always tested for functionality so an extension **MAY** be approved with broken functionality or inoperable preferences window.

However, if an extension is tested and found to be fundamentally broken it will be rejected. Extensions which serve no purpose or have no functionality will also be rejected.

### metadata.json must be well-formed

The `metadata.json` file that ships with every extension should be well-formed and accurately reflect the extension.

| Key | Description |
| --- | --- |
| name | This should not conflict with another extension if possible. If it is a fork of another extension it **MUST** have a unique name to distinguish it. |
| uuid | This must be of the form `extension-id@namespace`. `extension-id` and `namespace` **MUST** only contain numbers, letters, period (`.`), underscore (`_`) and dash (`-`). Extensions **MUST NOT** use `gnome.org` as the namespace, but may use a registered web domain or accounts such as `username.github.io` and `username.gmail.com`. |
| description | This should be a reasonable length, but may contain a few paragraphs separated with `\n` literals or a bullet point list made with `*` characters. |
| version | **Deprecated:** This field is set for internal use by `extensions.gnome.org`. |
| shell-version | This **MUST** only contain stable releases and up to one development release. Extensions must not claim to support future GNOME Shell versions. As of GNOME 40, an entry may simply be a major version like `40` to cover the entire release. |
| url | This should be a link to a Github or [GitLab](https://wiki.gnome.org/GitLab) repository where users can report problems and learn more about your extension. |
| session-modes | This **MUST** be dropped if you are only using `user` mode. The only valid values are `user` and `unlock-dialog`. |
| donations | This **MUST** only contain [possible keys](https://gjs.guide/extensions/overview/anatomy.html#donations) and **MUST** be dropped if you don't use any of the keys. |

Example:

json

```
{
    "uuid": "color-button@my-account.github.io",
    "name": "ColorButton",
    "description": "ColorButton adds a colored button to the panel.\n\nIt is a fork of MonochromeButton.",
    "shell-version": [ "3.38", "40", "41.alpha" ],
    "url": "https://github.com/my-account/color-button",
    "session-modes":  [ "unlock-dialog", "user" ]
}
```

### Session Modes

In rare cases, it is necessary for an extension to continue running while the screen is locked. In order to be approved to use the `unlock-dialog` session mode:

- It **MUST** be necessary for the extension to operate correctly.
- All signals related to keyboard events **MUST** be disconnected in `unlock-dialog` session mode.
- The `disable()` function **MUST** have a comment explaining why you are using `unlock-dialog`.

Extensions **MUST NOT** disable selectively.

### GSettings Schemas

For extensions that include a GSettings Schema:

- The Schema ID **MUST** use `org.gnome.shell.extensions` as a base ID.
- The Schema path **MUST** use `/org/gnome/shell/extensions` as a base path.
- The Schema XML file **MUST** be included in the extension ZIP file.
- The Schema XML filename **MUST** follow pattern of `<schema-id>.gschema.xml`.

### Do not use telemetry tools

Extensions **MUST NOT** use any telemetry tools to track users and share the user data online.

## Legal Restrictions

### Code of Conduct

Extensions distributed on the [extensions.gnome.org](https://extensions.gnome.org/) website are subject to the [Code of Conduct](https://conduct.gnome.org/). While extensions may be used to download, access or operate on external content, anything distributed from GNOME infrastructure **MUST NOT** violate the CoC. This includes:

- Extension name and description
- Text content, icons, emojis and other media
- Screenshots

If an extension passes review, but contains content violating the Code of Conduct, please [open a Code of Conduct report](https://conduct.gnome.org/).

### Political Statements

Extensions **MUST NOT** promote national or international political agendas. A reviewer **MAY** request that particular content be removed before approval or decide to reject an extension entirely.

This policy exists to protect community members and users that live under duress of national and/or international sanctions. In some cases, even accessing parts of a website containing particular political sentiments is a criminal offense.

### Licensing

GNOME Shell is licensed under the terms of the `GPL-2.0-or-later`, which means that derived works like extensions **MUST** be distributed under compatible terms (eg. `GPL-2.0-or-later`, `GPL-3.0-or-later`).

While your extension may include code licensed under a permissive license such as BSD/MIT, you are still approving GNOME to distribute it under terms compatible with the `GPL-2.0-or-later`.

If your extension contains code from another extension it **MUST** include attribution to the original author in the distributed files. Not doing so is a license violation and your extension will be rejected.

### Copyrights and Trademarks

Extensions **MUST NOT** include copyrighted or trademarked content without proof of express permission from the owner. Examples include:

- Brand Names and Phrases
- Logos and Artwork
- Audio, Video or Multimedia

## Recommendations

### Don't include unnecessary files

Extension submissions should not include files that are not necessary for it to function. Examples include:

- build or install scripts
- .po and .pot files
- unused icons, images or other media

A reviewer **MAY** decide to reject an extension which includes an unreasonable amount of unnecessary data.

### Use a linter

Using [ESLint](https://eslint.org/) to check your code can catch syntax errors and other mistakes before submission, as well as enforce consistent code style. You can find the ESLint rules used by GNOME Shell [on GitLab](https://gitlab.gnome.org/GNOME/gnome-shell-extensions/tree/main/lint).

Following a specific code style is not a requirement for approval, but if the codebase of an extension is too messy to properly review it **MAY** be rejected. This includes obfuscators and transpilers used with TypeScript.

### UI Design

Although not required for approval, it is recommended that extension preferences follow the [GNOME Human Interface Guidelines](https://developer.gnome.org/hig/) to improve consistency with the GNOME desktop.



# This document contains links to Gnome shell extensions and Gnome shell development documents


## [Gnome Shell Reference API](https://gjs-docs.gnome.org/)


## [Gnone Shell Developer Guide](https://gjs.guide/guides/)


## [Gnome Shell extensions Guide](https://gjs.guide/extensions/)

### [Gnome Shell Extensions Review Guidlines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)

### Development
#### [Getting started](https://gjs.guide/extensions/development/creating.html)
#### [Translations](https://gjs.guide/extensions/development/translations.html)
#### [Preferences](https://gjs.guide/extensions/development/preferences.html)
#### [Accessibility](https://gjs.guide/extensions/development/accessibility.html)
#### [Debugging](https://gjs.guide/extensions/development/debugging.html)
#### [Targeting Older GNOME Versions](https://gjs.guide/extensions/development/targeting-older-gnome.html)
#### [TypeScript and LSP ](https://gjs.guide/extensions/development/typescript.html)


### Overview
#### [Anatomy of an Extension](https://gjs.guide/extensions/overview/anatomy.html)
#### [Architecture](https://gjs.guide/extensions/overview/architecture.html)
#### [Imports and Modules](https://gjs.guide/extensions/overview/imports-and-modules.html)
#### [Updates and Breakage](https://gjs.guide/extensions/overview/updates-and-breakage.html)


### Topics
#### [Extension (ESModule)](https://gjs.guide/extensions/topics/extension.html)
#### [Dialogs](https://gjs.guide/extensions/topics/dialogs.html)
#### [Notifications](https://gjs.guide/extensions/topics/notifications.html)
#### [Popup Menu](https://gjs.guide/extensions/topics/popup-menu.html)
#### [Quick Settings](https://gjs.guide/extensions/topics/quick-settings.html)
#### [Search Provider](https://gjs.guide/extensions/topics/search-provider.html)
#### [Session Modes](https://gjs.guide/extensions/topics/session-modes.html)
#### [Port Extensions to GNOME Shell 49](https://gjs.guide/extensions/upgrading/gnome-shell-49.html)
#### [Port Extensions to GNOME Shell 48](https://gjs.guide/extensions/upgrading/gnome-shell-48.html)
