# Translation guide for the Breezy Desktop KWin KCM

This document covers:
1. [Instructions for translators](#instructions-for-translators) — how to translate the KCM UI into your language
2. [Maintainer workflow](#maintainer-workflow) — how to keep translations up to date as strings change

---

## Instructions for translators

### Supported languages

The following languages are currently listed in `kwin/po/LINGUAS`.  If yours is
missing, follow the steps below and open a pull request — new languages are
welcome.

| Code    | Language              |
|---------|-----------------------|
| `de`    | German                |
| `es`    | Spanish               |
| `fr`    | French                |
| `it`    | Italian               |
| `ja`    | Japanese              |
| `pl`    | Polish                |
| `pt_BR` | Portuguese (Brazil)   |
| `ru`    | Russian               |
| `sv`    | Swedish               |
| `uk_UA` | Ukrainian             |
| `zh_CN` | Chinese (Simplified)  |

### What to translate

All translatable strings for the KDE Control Module (KCM) live in:

```
kwin/po/<lang>/breezy_desktop_kwin.po
```

Each file is a standard **GNU gettext PO** file.  You only need a plain-text
editor to work with it (though dedicated PO editors like
[Lokalize](https://apps.kde.org/lokalize/),
[Poedit](https://poedit.net/), or
[Virtaal](https://virtaal.translatehouse.org/) make the job easier).

### Step-by-step

1. **Clone the repository** (or fork it on GitHub):
   ```bash
   git clone https://github.com/wheaney/breezy-desktop.git
   ```

2. **Open your language's PO file** in your editor, for example:
   ```
   kwin/po/de/breezy_desktop_kwin.po
   ```
   If your language is not listed yet, copy the template:
   ```bash
   cp kwin/po/breezy_desktop_kwin.pot kwin/po/<lang>/breezy_desktop_kwin.po
   ```
   Then fill in the `Language:` header and the `Plural-Forms:` header.
   You can look up the correct plural form for your language at
   <https://www.gnu.org/software/gettext/manual/html_node/Plural-forms.html>.

3. **Translate each `msgstr ""`** entry.  Leave `msgid` untouched — it is the
   English source string.

   ```po
   # Before
   msgid "No device connected"
   msgstr ""

   # After
   msgid "No device connected"
   msgstr "Kein Gerät verbunden"
   ```

   **Things to keep in mind:**
   - Strings containing `%1`, `%2`, … are placeholders.  You may reorder them
     in the translation if your language requires a different word order, but
     every placeholder present in `msgid` must also appear in `msgstr`.
   - Tab titles prefixed with `&` (e.g. `"&General"`) use that character as a
     keyboard accelerator.  You may move the `&` to a different letter that
     makes sense in your language.
   - Strings marked with `notr="true"` in the source `.ui` files are not
     extracted and do not appear in the PO file — you don't need to worry about
     them.
   - The `Author:` and `License:` lines in the About tab may be left unchanged
     if the format already makes sense in your language.

4. **Update your name and contact** in the PO file header:
   ```po
   "Last-Translator: Your Name <you@example.com>\n"
   "Language-Team: German\n"
   ```

5. **Submit your changes** by opening a pull request on GitHub.

---

## Maintainer workflow

### Prerequisites

```bash
sudo apt-get install kdesdk-scripts gettext   # Debian / Ubuntu
# or
sudo dnf install kf6-kdesdk-scripts gettext   # Fedora
```

`kdesdk-scripts` provides `extractrc`, which converts Qt Designer `.ui` files
into a temporary C++ file that `xgettext` can process.

### Updating translations after string changes

Whenever you add, remove, or change a user-visible string in the KCM source
(`src/kcm/*.cpp`, `src/kcm/*.h`, `src/kcm/*.ui`), run the dev script:

```bash
kwin/bin/update_pot_files
```

This script will:

1. Run `extractrc` on all `.ui` files to capture strings wrapped by
   `ki18n_wrap_ui`.
2. Run `xgettext` on the C++ sources (using KDE i18n keywords such as
   `i18n()`, `I18N_NOOP()`, etc.) to extract all translatable strings into
   `kwin/po/breezy_desktop_kwin.pot`.
3. Run `msgmerge` on each per-language `.po` file to pull in new strings and
   mark removed strings as obsolete.
4. Compile each updated `.po` file to a binary `.mo` file under
   `kwin/po/<lang>/LC_MESSAGES/` for local testing.

After running the script, **review the changes** to
`kwin/po/breezy_desktop_kwin.pot` and each `.po` file, then commit them.
Translators can then update their language files with the new `msgid` entries
that appear with empty `msgstr ""`.

### Adding a new language

1. Add the language code to `kwin/po/LINGUAS` (space-separated, on one line).
2. Run `kwin/bin/update_pot_files` — it will create
   `kwin/po/<lang>/breezy_desktop_kwin.po` automatically.
3. Commit the new file and invite a native speaker to fill in the translations.

### Adding new translatable strings in C++

Use `i18n()` (or `ki18n()`, `i18nc()`, etc.) from `<KLocalizedString>`.
**Do not** use Qt's `tr()` or `QObject::tr()` — they bypass the KDE i18n
infrastructure and are not extracted into the PO files.

```cpp
// ✓ Correct
#include <KLocalizedString>
label->setText(i18n("No device connected"));
label->setText(i18n("Version %1", versionString));

// ✗ Wrong — not extracted, not translated
label->setText(tr("No device connected"));
label->setText(QStringLiteral("No device connected"));
```

For strings in `.ui` files, `ki18n_wrap_ui()` in CMake handles the wrapping
automatically at build time — just write normal `<string>` elements.  If a
string should *not* be translated (e.g. a CSS stylesheet or a numeric
placeholder), add `notr="true"`:

```xml
<property name="styleSheet">
  <string notr="true">color: rgb(200,0,0); font-weight: bold;</string>
</property>
```

For constant strings defined at file or namespace scope (e.g. keyboard
shortcut labels), use `I18N_NOOP()` in the header to mark them for extraction,
and call `i18n()` on them at the point of use:

```cpp
// shortcuts.h
const char *actionText = I18N_NOOP("Toggle XR Effect");

// usage site
action->setText(i18n(shortcut.actionText));
```
