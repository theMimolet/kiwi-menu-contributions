# Translating

## How to Contribute Translations

- Edit the relevant `.po` file and create a PR to submit changes.
- If adding a new language use `kiwimenu.pot` file as a template and save it to `po/xx.po` and then create a PR.
 

## Note

> Current translations are machine-generated and may contain mistakes


## Compiling translations for testing

The helper script compiles translations and produces a `locale/` folder for local testing.

Run the script to update `locale/`:

```bash
./compile-translations.sh
```

## Further Reading

- [GJS translations guide](https://gjs.guide/extensions/development/translations.html)


