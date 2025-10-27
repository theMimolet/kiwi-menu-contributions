# Translation Files for Kiwi Menu

This directory contains translation files for the Kiwi Menu extension.

## File Structure

- `POTFILES.in` - List of source files containing translatable strings
- `LINGUAS` - List of available language translations
- `kiwimenu.pot` - Translation template file (POT)
- `*.po` - Individual translation files for each language

## Available Translations

Currently available translations:
- **German (de)** - Deutsch
- **Spanish (es)** - Español
- **French (fr)** - Français
- **Latvian (lv)** - Latviešu

## Adding a New Translation

1. Copy the template file:
   ```bash
   cp kiwimenu.pot your_language_code.po
   ```

2. Edit the `.po` file header with your information:
   - Update `Language-Team`
   - Update `Language` code
   - Add your name and email in `Last-Translator`

3. Translate all `msgstr` entries (leave `msgid` unchanged)

4. Add your language code to `LINGUAS`:
   ```bash
   echo "your_language_code" >> LINGUAS
   ```

5. Compile and test:
   ```bash
   cd ..
   ./compile-translations.sh
   ```

## Updating Translations

When new translatable strings are added to the code:

1. Extract new strings (requires gettext tools):
   ```bash
   xgettext --from-code=UTF-8 \
            --language=JavaScript \
            --keyword=_ \
            --keyword=gettext \
            --package-name="kiwimenu" \
            --package-version="1.0" \
            --msgid-bugs-address="https://github.com/kem-a/kiwimenu-kemma/issues" \
            -o po/kiwimenu.pot \
            extension.js prefs.js src/*.js
   ```

2. Update existing translations:
   ```bash
   msgmerge -U po/your_language.po po/kiwimenu.pot
   ```

3. Edit the `.po` file to translate new strings

4. Recompile:
   ```bash
   ./compile-translations.sh
   ```

## Compiling Translations

To compile all `.po` files to `.mo` format:

```bash
cd ..
./compile-translations.sh
```

This will create the `locale/` directory with compiled translations.

## Testing Your Translation

1. Compile the translations
2. Restart GNOME Shell (Alt+F2, type `r`, press Enter)
3. Reload the extension or log out/log in
4. The extension will automatically use your system's language

## Translation Guidelines

- Keep translations concise and natural
- Use the same terminology as GNOME Shell for consistency
- Test your translations in context
- For menu items ending with `...`, maintain the ellipsis
- Preserve formatting like `%s` placeholders

## Translation Credits

- German (de): Community contribution welcome
- Spanish (es): Community contribution welcome
- French (fr): Community contribution welcome
- Latvian (lv): Community contribution welcome

## Contributing

Contributions are welcome! Please submit pull requests with:
- Complete translations for new languages
- Updates to existing translations
- Corrections and improvements

## License

Translation files are distributed under the same license as Kiwi Menu (GPL-3.0-or-later).
