# Chat Module

This module serves as a starting point for adding real time chat to your application. Before using the module for the first time, we recommend reading the official platformOS documentation on [WebSockets](https://documentation.platformos.com/use-cases/using-websockets) and on [Example Application](#example-application).

This module follows the [platformOS DevKit best practices](https://documentation.staging.oregon.platform-os.com/developer-guide/modules/platformos-modules) and includes the [core module](https://github.com/Platform-OS/pos-module-core) as a dependency, enabling you to implement patterns such as [Commands](https://github.com/Platform-OS/pos-module-core?tab=readme-ov-file#commands--business-logic) and [Events](https://github.com/Platform-OS/pos-module-core?tab=readme-ov-file#events). It also includes the [user module](https://github.com/Platform-OS/pos-module-user) and [profile module](https://github.com/Platform-OS/pos-module-profile) as a dependency.

For more information, 
- read the documentation about the [built-in User table](https://documentation.platformos.com/developer-guide/users/user),
- learn about [how platformOS manages sessions](https://documentation.platformos.com/developer-guide/users/session),
- and gain a high-level overview of [authentication strategies in platformOS](https://documentation.platformos.com/developer-guide/users/authentication).

## Installation

The platformOS Chat Module is available on the [Partner Portal Modules Marketplace](https://partners.platformos.com/marketplace/pos_modules/152).

### Prerequisites

Before installing the module, ensure that you have [pos-cli](https://github.com/mdyd-dev/pos-cli#overview) installed. This tool is essential for managing and deploying platformOS projects.

The platformOS Chat Module is fully compatible with [platformOS Check](https://github.com/Platform-OS/platformos-lsp#platformos-check----a-linter-for-platformos), a linter and language server that supports any IDE with Language Server Protocol (LSP) integration. For Visual Studio Code users, you can enhance your development experience by installing the [VSCode platformOS Check Extension](https://marketplace.visualstudio.com/items?itemName=platformOS.platformos-check-vscode).

### Installation Steps

1. **Navigate to your project directory** where you want to install the Chat Module.

2. **Run the installation command**:

```bash
   pos-cli modules install chat
```

This command installs the Chat Module along with its dependencies (such as [pos-module-core](https://github.com/Platform-OS/pos-module-core)) and updates or creates the `app/pos-modules.json` file in your project directory to track module configurations.

### Setup

1.  **Install the module** using the [pos-cli](https://github.com/Platform-OS/pos-cli).

2.  If you haven't done it already, follow the instructions to setup [pos-module-user-](https://github.com/Platform-OS/pos-module-user?tab=readme-ov-file#setup). During this process, you will create an overwrite of the permissions file `app/modules/user/public/lib/queries/role_permissions/permissions.liquid`
 
3. Overwrite default views that you would like to customize by following the guide on [overwriting a module file](https://documentation.platformos.com/developer-guide/modules/modules#overwritting-a-module-file). This allows you to add functionality based on your project requirements. At a minimum, you should overwrite the [permissions file](modules/user/public/lib/queries/role_permissions/permissions.liquid), where you will configure [RBAC authorization](#rbac-authorization) roles and permissions for your application - add `chat.inbox` permission to the role(s) that you would like to have access to the chat available at `/inbox`. In our example, the `inbox.chat` permission was added to `authenticated` role, meaning all signed in users have access to the chat. Snippet to create an overwrite to copy-paste into your terminal:

```
mkdir -p app/modules/user/public/lib/queries/role_permissions
cp modules/user/public/lib/queries/role_permissions/permissions.liquid app/modules/user/public/lib/queries/role_permissions/permissions.liquid
```

4. Add the following to the `<head>` section of your application layout to get the basic styling provided with the module. To overwrite the colors and spacings you can overwrite the CSS variables in `pos-config.css`.

```
{% render 'modules/common-styling/init' %}
<link rel="stylesheet" href="{{ 'modules/user/style/pos-user-form.css' | asset_url }}">
<link rel="stylesheet" href="{{ 'modules/chat/style/pos-chat-inbox.css' | asset_url }}">
```

5. Add the following to the `<head>` section of your application layout **before any other `<script>` tag on the page**. Or - if you already using an import map, just extend it with the following:

```
<script type="importmap">
  {
    "imports": {
      "/": "{{ 'modules/chat/js/' | asset_url }}",
      "pos-chat.js": "{{ 'modules/chat/js/pos-chat.js' | asset_url }}",
      "pos-chat-consumer.js": "{{ 'modules/chat/js/pos-chat-consumer.js' | asset_url }}",
      "pos-chat-csrfToken.js": "{{ 'modules/chat/js/pos-chat-csrfToken.js' | asset_url }}",
      "pos-chat-notifications.js": "{{ 'modules/chat/js/pos-chat-notifications.js' | asset_url }}",
      "./": "./"
    }
  }
</script>
```

### Managing Module Files

The default behavior of modules is that **the files are never deleted**. It is assumed that developers might not have access to all of the files, and thanks to this feature, they can still overwrite some of the module's files without breaking them. Since the User Module is fully public, it is recommended to delete files on deployment. To do this, ensure your `app/config.yml` includes the User Module and its dependencies in the list `modules_that_allow_delete_on_deploy`:

``` yaml
modules_that_allow_delete_on_deploy:
- core
- user
- profile
- chat
```

## Example application

We recommend creating a [new Instance](https://partners.platformos.com/instances/new) and deploying this module as an application to get a better understanding of the basics and the functionality this module provides. When you install the module using `pos-cli modules install chat`, only the contents of the `modules/chat` will be available in your project. The `app` directory serves as an example of how you could incorporate the Chat Module into your application. When analyzing the code in the `app` directory, pay attention to the following files:

* ** `app/config.yml`** and **`app/user.yml`**: These files are defined according to the [Setup](#setup) instructions.
* ** `app/modules/user/public/lib/queries/role_permissions/permissions.liquid`**: Demonstrates how to configure permissions in your application by [overwriting a module file](https://documentation.platformos.com/developer-guide/modules/modules#overwriting-a-module-file).

## Functionality provided by the chat module:

Once the module is installed and you have completed the [setup](#setup), you will immediately gain access to the new endpoints created by this module. For example, you can navigate to `/inbox` for the chat window. 

- [x] **[Inbox](#inbox)**:  

TODO (Upcoming Features)


### Inbox

Inbox

#### Endpoints for the registration

The table below outlines the [resourceful routes](https://documentation.platformos.com/developer-guide/modules/platformos-modules#resourceful-route-naming-convention) provided for registration functionality:

| HTTP method   | slug  | page file path |  description |
|---|---|---|---|
| GET  | /inbox | `modules/chat/public/views/pages/inbox.liquid` | Renders a chat | 

#### CRUD commands 

...


## Customizing the looks

The chat module by default uses styling provided by the platformOS Common Styling module. It's built with the intention to easily overwrite the colors, fonts and spacings by overwriting the CSS variables stored in `modules/common-styling/style/pos-config.css`. You can create your own `.css` file and just overwrite any value of any variable. If you need more CSS customization you can obviously just use standard styling techniques and if you need to change the HTML structure even further, you can overwrite any liquid partial used in the chat.
