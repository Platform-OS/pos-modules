# platformOS Common-Styling Module

_(WIP)_

The Common-Styling module provides a reusable design system for platformOS to make your projects look great out of the box and gives you simple tools to customize them.

It includes reusable CSS and JavaScript that are (or will be) leveraged by [platformOS modules](https://documentation.platformos.com/developer-guide/modules/platformos-modules#our-modules), and which you can also use directly in your own projects. The idea is to provide a consistent, documented way of building modules that look good from the start and which you can easily customize to fit your needs.

Common-styling follows the [platformOS DevKit best practices](https://documentation.platformos.com/developer-guide/modules/platformos-modules).

## Features

- ⚙️ Customizable through CSS variables defined in `pos-config.css`
- 📖 Built-in `/style-guide` page to preview components and check available variables
- 🧩 Provides shared CSS and JavaScript utilities for use in platformOS modules and projects
- 📝 Includes base styles for forms, buttons, typography, and other common components
- 🛡️ Scoped with `pos-` prefixes and CSS layers to avoid conflicts with project code
- 🌙 Supports both light and dark themes (automatic or manual)
- 📱 Responsive styles included by default
- ✅ Follows [platformOS DevKit best practices](https://documentation.platformos.com/developer-guide/modules/platformos-modules)

## Installation

The platformOS Common Styling Module is available on the [Partner Portal Modules Marketplace](https://partners.platformos.com/marketplace/pos_modules/154).

After installation, visit `<your instance url>/style-guide` to preview all available components, see examples of forms, buttons, typography and the complete list of CSS variables you can override.

### Prerequisites

Before installing the module, ensure that you have [pos-cli](https://github.com/mdyd-dev/pos-cli#overview) installed. This tool is essential for managing and deploying platformOS projects.

The platformOS Common Styling is fully compatible with [platformOS Check](https://github.com/Platform-OS/platformos-lsp#platformos-check----a-linter-for-platformos), a linter and language server that supports any IDE with Language Server Protocol (LSP) integration. For Visual Studio Code users, you can enhance your development experience by installing the [VSCode platformOS Check Extension](https://marketplace.visualstudio.com/items?itemName=platformOS.platformos-check-vscode).

### Installation Steps

1. **Navigate to your project directory** where you want to install the Common Styling Module.

2. **Run the installation command**:

```bash
   pos-cli modules install common-styling
```

This command installs the Common Styling Module and updates or creates the `app/pos-modules.json` file in your project directory to track module configurations.

3. **Download the source code** into your local environment:

```bash
   pos-cli modules download common-styling
```

4. **Explore the built-in Style Guide.**
After installation, visit `/style-guide` on your instance. (Make sure you deploy the module using `pos-cli deploy` command)
- Preview all available components.
- See examples of forms, buttons, and typography.
- Find the complete list of CSS variables you can override.


### Setup

1. **Install the module** using the [pos-cli](https://github.com/Platform-OS/pos-cli).

2. **Include the following partial** into your [layout](https://documentation.platformos.com/developer-guide/pages/layouts)'s `<head>` section:

```liquid
{% render 'modules/common-styling/init' %}
```

👉 If you do not have a layout, check the [style-guide's layout](https://github.com/Platform-OS/pos-module-common-styling/blob/master/modules/common-styling/public/views/layouts/style-guide.liquid) for an example of a minimal layout.

3. **Scope the styling with `pos-app`:**
- To apply common-styling globally, add `class="pos-app"` to your application’s `<html>` tag:

```html
<html lang="en" class="pos-app">
```
- To apply styles only in certain parts of your app, wrap content in a container:

```html
<div class="pos-app">
</div>
```

4. Ensure you configured your [Instance](https://documentation.platformos.com/developer-guide/glossary#instance) to escape output instead of sanitizing through [app/config.yml](https://documentation.platformos.com/developer-guide/platformos-workflow/directory-structure/config)

```yaml
---
escape_output_instead_of_sanitize: true
---
```

5. **Optionally enable the [CSS reset](https://github.com/Platform-OS/pos-module-common-styling/blob/master/modules/common-styling/public/assets/style/pos-reset.css)**. It resets default browser styling and fixes some browser-specific issues
- It’s safe to use in a fresh app.
- In an existing app, enabling it might cause unexpected changes.

To use it, pass the `reset: true` parameter to the render tag mentioned above and use a `pos-app` class anywhere on your main content container:

```liquid
{% render 'modules/common-styling/init', reset: true %}
```

> **Note:** If you plan to add your own CSS overrides, always load them **after** `common-styling` in your layout. This way, your styles take precedence over the defaults.

## Customizing CSS

When using the `common-styling` module, you can configure the look of components by overriding the CSS variables defined in **`pos-config.css`**.  
Define overrides inside `:root {}` so they apply globally across your app.
Instead of editing the module directly, you can override only the variables you need in your own stylesheet.

👉 Copy only the variables you want to change into your app’s CSS file, and redefine them there.

👉 Use `/style-guide` as your main reference for available variables and component classes. This page lists all color variables, form components, buttons, and more. It’s the recommended way to discover what you can override.

👉 Common-styling is responsive out of the box. To test layouts, use your browser’s responsive design mode (DevTools → device toolbar).


### 1. Create a custom stylesheet

Add a file to your project, for example:

```
app/assets/<my-app-name>-config.css
```

This is where you’ll put your overrides.

### 2. Load it after common-styling

In your layout (for example: `application.liquid`), include your stylesheet **below** the `common-styling` init. This ensures your overrides take precedence.

```liquid
{% render 'modules/common-styling/init' %}
<link rel="stylesheet" href="{{ 'variables.css' | asset_url }}">
```

### 3. Override variables

Copy only the variables you want to change from `pos-config.css` into your stylesheet, and redefine them under `:root`.

Example — giving primary buttons a green theme:

```css
:root {
  --pos-color-button-primary-background: #008000;
  --pos-color-button-primary-hover-background: #00a000;
}
```

### Tips and Best practices

- Don’t hardcode values like colors or sizes (with very few exceptions). Always rely on the provided CSS variables.
- Override **only what you need** — don’t copy the full config.
- You can use CSS functions like `calc()`, `from-color()`, or `color-mix()` if you need to adjust variables dynamically.
- Stick to the provided variable system, which maps to our [Figma design kit](https://documentation.platformos.com/kits/ui/platformos-design-kit#download).
- If your app supports **dark mode**, remember to override both light and dark variables.
- Use `/style-guide` to preview available variables and confirm your overrides.


## Dark mode

The `common-styling` module includes two base themes by default: a light and a dark one.

### Automatic dark mode

To enable automatic dark mode (switches based on the user’s system preference), add the following class to the root `<html>` tag in your layout:

```html
<html class="pos-app pos-theme-darkEnabled">
```

### Manual dark mode

If you want to control the theme manually, use:

```html
<html class="pos-app pos-theme-dark">
```

This forces the dark theme regardless of system settings.

### Notes

- Both light and dark themes use the same set of CSS variables. If you override variables, make sure to provide values for both themes if needed.
- You can preview dark mode in your browser [using dev tools](https://stackoverflow.com/a/59223868), toggling system preferences, or manually applying `.pos-theme-dark`.
- Example — overriding variables just for dark mode:

```css
:root {
  --pos-color-dark-button-primary-background: #004d00;
}
```


## Scoping CSS

To avoid conflicts and keep styles predictable, all CSS in this module follows a **scoping** convention.

When naming your module CSS files, please prefix them with `pos-` for consistency.

### Naming conventions

- **Files:** Prefix module CSS files with `pos-` (e.g., `pos-form.css`, `pos-button.css`) for consistency.
- **Classes:** Prefix CSS classes with `pos-` (e.g., `.pos-form`, `.pos-button`). This ensures styles from `common-styling` won’t interfere with unrelated CSS in your project.

👉 Keep in mind that the module can be used in various contexts, so any styling needs to be scoped just to the module code.

### CSS layers

All styles from `common-styling` are placed inside a dedicated CSS layer.
This lowers specificity so you can override them easily in your own stylesheet, without having to worry about the selectors used.

### Scoped styling

Some CSS rules will be inherited when the parent container has a specific class. For example, the `.pos-form` scopes styling so that inputs, buttons, and other form-related elements inside the container adopt the design system styles.

### Component structure

**Each component should have its own separate CSS file.** This keeps the codebase modular, easier to maintain, and consistent across projects.

For example:

- `pos-form.css` for forms
- `pos-button.css` for buttons
- `pos-card.css` for cards

## JavaScript namespace for modules

Use ESM Modules to build JavaScript.

The modules should not pollute the global JavaScript namespace. For this purpose, we are using the `pos` namespace attached to the global `window` object. Extending the namespace is the preferred way to store all the needed data, translations, and module public interface.

There are several basic objects used across the modules that could be extended for consistency. Those are shared across many modules, so **remember not to overwrite them in your code** and extend the objects instead.

| object     | description                                    |
|------------|------------------------------------------------|
| window.pos | Global namespace for all module-related data. |
| window.pos.modules | If your module provides a public API or a constructor, then you should attach it to this object,t namespacing your module accordingly `window.pos.module.myModule = {}` |
| window.pos.modules.active | If your module creates a separate instance and provides a public API, it can be attached to this object. |
| window.pos.profile | Stores all the profile-related data for the currently logged-in user. |
| window.pos.translations | If your JavaScript code needs access to any translations, you should append them to this object. |

As an example starting point for defining JavaScript for your module, you can use the following code:

```html
<script>
  /* namespace */
  if(typeof window.pos !== 'object'){
    window.pos = {};
    window.pos.modules = {};
    window.pos.translations = {};
  }

  /* profile namespace */
  if(typeof window.pos.profile !== 'object'){
    window.pos.profile = {};
  }

  window.pos.profile.myProfileVariable = 'foo';

  /* translations used in module */
  window.pos.translations = {
    ...window.pos.translations,
    myTranslation: 'bar'
  }
</script>
```

## Debugging JavaScript modules

To enable debug mode, you can set the `pos.debug` to `true` in the JS Console. This will log events from the default provided modules.

When building your module, please use the following method to log debug data:

```js
pos.modules.debug([true || module.settings.debug], [module id (string)], [message (string)]);
```

## Module communication using events

To provide a way of reacting to your module changes, please use JavaScript events when appropriate, prefixing the event with `pos-` as follows:

```js
document.dispatchEvent(new CustomEvent('pos-somethingHappenedInMyModule', { bubbles: true, detail: { something: 'new value' } }));
pos.modules.debug(module.settings.debug, 'event', `pos-somethingHappenedInMyModule`, { something: new value });
```

Using `pos.modules.debug()` to add information about the event provides an easy way for the developers to react to changes provided by your module without the need to check the code or browse through documentation.

## Building dependencies

Rollup is used to build dependencies from NPM registry. To add a new dependency:

1. Use `npm install [package]` as you would normally do
2. Create new JS file in `src/js/` named `dependency-[package name].js`
3. In that file use the needed `import` statements
4. Use `npm run build` to generate the build files for each dependency in `modules/common-styling/public/assets/js`
5. Use `modules/common-styling/public/views/partials/init.liquid` to load your dependency using async `import()` function

## Using JavaScript modules

After adding the code for your module in `modules/common-styling/public/assets/js/` use the async `import()` function to load them and assign their instances to `pos.modules.active` namespace depending on if they are needed on the page. For example let's load a collapsible list module only when there is such list on the page:

```
/* collapsible lists */
if(document.querySelector('.pos-collapsible')){
  import('{{ 'modules/common-styling/js/pos-collapsible.js' | asset_url }}').then(module => {
    document.querySelectorAll('.pos-collapsible').forEach((element, index) => {
      window.pos.modules.active[element.id || `pos-collapsible-${index}`] = new window.pos.modules.collapsible({
        container: element,
        id: element.id || `pos-collapsible-${index}`
      });
    });
  });
};
```

## Handling cache with importmaps

When using the `import` statement in your JavaScript files, you will request a JS file from the CDN that could already be cached by the browser. platformOS handles breaking the cache for assets by using the `asset_url` filter. You cannot use it in the JS files, though, but the browsers allow you to map any filename to any other URL using [Import Maps](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap). Currently, only a single import map on a page can be used, and it needs to be defined before any other JS script. (This will change soon as multiple import maps are in the works for all the browsers.)

An example import map looks like this:

```html
<script type="importmap">
  {
    "imports": {
      "/": "{{ 'modules/chat/js/' | asset_url }}",
      "chat.js": "{{ 'modules/chat/js/chat.js' | asset_url }}",
      "consumer.js": "{{ 'modules/chat/js/consumer.js' | asset_url }}",
      "csrfToken.js": "{{ 'modules/chat/js/csrfToken.js' | asset_url }}",
      "notifications.js": "{{ 'modules/chat/js/notifications.js' | asset_url }}",
      "./": "./"
    }
  }
</script>
```

The first line allows you to use relative `import` statements inside your JS files, the last line resets it back to the default.

## Components

### Toast notifications

1. Render the partial in your application layout (preferably at the very bottom)

```liquid
{% liquid
  function flash = 'modules/core/commands/session/get', key: 'sflash'
  if context.location.pathname != flash.from or flash.force_clear
    function _ = 'modules/core/commands/session/clear', key: 'sflash'
  endif
  render 'modules/common-styling/toasts', params: flash
%}
```

From JavaScript, you can use:

```js
new pos.modules.toast('[severity]', '[message]') to show new notification
```

On the server-side:
[TO DO]


### Loading HTML endpoint and placing it in a container

A pre-defined method of loading HTML content into a container:

```js
const { load } = await import('modules/common-styling/js/pos-load.js');
pos.modules.load = load;
```

```js
await pos.modules.load({
  endpoint: [string],
  target: [string],
  method: [string],
  trigger: [dom node],
  triggerType: [string]
});
```
|  parameter  | type     | description                                                            |
|-------------|----------|------------------------------------------------------------------------|
| endpoint    | string   | URL of the endpoint that returns the HTML to be applied to a container |
| target      | string   | Selector for the target container that the HTML will be applied to     |
| method      | string   | Either `replace` or `append`. The returned HTML will replace the content of the container or will be appended after the last node of the container |
| trigger     | dom node | The HTML element that triggers loading the endpoint |
| triggerType | string   | Either `click` or `hover`. Defines whether loading starts on click or hover trigger |


You can use the `load` method directly or use the simpler method by adding some custom attributes to the trigger element that will initialize loading the endpoint when interacted with:

Clicking the following button will load the HTML from `/test/example_endpoint` to the container with ID `example_container`:

```
<button type="button" data-load-content="/test/example_endpoint" data-load-target="#example_container">

<div id="example_container">Loading…</div>
```

| attribute              | description                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| data-load-content    | URL of the endpoint that returns the HTML to be applied to a container       |
| data-load-target     | Selector for the target container that the HTML will be applied to           |
| data-load-method     | `replace` or `append` – the returned HTML will either replace the container’s content or be appended after the last node of the container |
| data-load-trigger-type | Defines whether the loading process is triggered by a `click` or `mouseenter` event |
