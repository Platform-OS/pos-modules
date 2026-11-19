# Chat Module

This module serves as a starting point for adding real time chat to your application. Before using the module for the first time, we recommend reading the official platformOS documentation on [WebSockets](https://documentation.platformos.com/use-cases/using-websockets) and on [Example Application](#example-application).

This module follows the [platformOS DevKit best practices](https://documentation.staging.oregon.platform-os.com/developer-guide/modules/platformos-modules) and includes the [core module](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-core) as a dependency, enabling you to implement patterns such as [Commands](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-core/README.md#commands--business-logic) and [Events](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-core/README.md#events). It also includes the [user module](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-user) and [profile module](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-profile) as a dependency.

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

This command installs the Chat Module along with its dependencies (such as [pos-module-core](https://github.com/Platform-OS/pos-modules/tree/master/pos-module-core)) and updates or creates the `app/pos-modules.json` file in your project directory to track module configurations.

### Setup

1.  **Install the module** using the [pos-cli](https://github.com/Platform-OS/pos-cli).

2.  If you haven't done it already, follow the instructions to setup [pos-module-user-](https://github.com/Platform-OS/pos-modules/blob/master/pos-module-user/README.md#setup). During this process, you will create an overwrite of the permissions file `app/modules/user/public/lib/queries/role_permissions/permissions.liquid`
 
3. Overwrite default views that you would like to customize by following the guide on [overwriting a module file](https://documentation.platformos.com/developer-guide/modules/modules#overwritting-a-module-file). This allows you to add functionality based on your project requirements. At a minimum, you should overwrite the [permissions file](modules/user/public/lib/queries/role_permissions/permissions.liquid), where you will configure [RBAC authorization](#rbac-authorization) roles and permissions for your application - add `chat.inbox` permission to the role(s) that you would like to have access to the chat available at `/inbox`. In our example, the `inbox.chat` permission was added to `authenticated` role, meaning all signed in users have access to the chat. Snippet to create an overwrite to copy-paste into your terminal:

```
mkdir -p app/modules/user/public/lib/queries/role_permissions
cp modules/user/public/lib/queries/role_permissions/permissions.liquid app/modules/user/public/lib/queries/role_permissions/permissions.liquid
```

4. Add the following to the `<head>` section of your application layout to get the basic styling provided with the module. To overwrite the colors and spacings you can overwrite the CSS variables in `pos-config.css`.

```
{% function current_profile = 'modules/user/helpers/current_profile' %}
{% render 'modules/common-styling/init', timezone: current_profile.properties.timezone %}
<link rel="stylesheet" href="{{ 'modules/user/style/pos-user-form.css' | asset_url }}">
<link rel="stylesheet" href="{{ 'modules/chat/style/pos-chat-inbox.css' | asset_url }}">
```

The `init` partial also formats the dates in the chat (and any others shown with common-styling's `time` partial) in the visitor's language and timezone. If your profiles have a `timezone` property, like the one above, the dates are shown in it instead - the chat passes it to the dates it renders too. Without one, leave the `timezone` out.

The chat's scripts load each other without an import map, so none is needed. If your layout still has the `<script type="importmap">` block with the `pos-chat*.js` entries from an earlier version of this module, remove those entries. Its `"/"` entry could break your app's own module imports.

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
| GET  | /inbox | `modules/chat/public/views/pages/inbox.liquid` | Renders a chat. `?to_uuid=<profile uuid>` opens the chat with that profile - the conversation is created when its first message is sent, so linking to it is safe | 
| POST | /api/chat/conversations | `modules/chat/public/views/pages/api/conversations/create.json.liquid` | Starts the conversation with `to_uuid`, used by the chat itself | 
| GET | /api/chat/notifications.json | `modules/chat/public/views/pages/api/notifications/show.json.liquid` | The current user's number of unread conversations, see [Live notifications](#live-notifications) | 

#### Who can be found and messaged

The search in the inbox finds people by their name (not their email) and only lists people who can use the chat - those whose roles grant the `chat.inbox` permission. A conversation can only be started with someone who can use the chat. To add your own rules on who may contact whom, overwrite `modules/chat/public/lib/commands/conversations/find_or_create/check.liquid`: it gets the `participant_ids` of the conversation about to be started and the `current_profile`, and returns the object with `valid` and `errors` (see the default implementation).

#### Live notifications

Any page of your app (not only `/inbox`) can react to new messages as they arrive, for example to show a toast or a badge with the number of unread conversations. The module sends every new message to its recipients over a WebSocket, and `pos-chat-notifications.js` turns it into DOM events dispatched on `document`, so your code doesn't have to deal with the WebSocket itself.

Render it once in your layout, for example in the `<head>`:

```liquid
{% render 'modules/chat/notifications/init' %}
```

It renders nothing for visitors who aren't signed in or can't use the chat (the `chat.inbox` permission). For everyone else it sets up the live notifications on the page. On the inbox page the chat uses the same connection, so the page opens only one WebSocket.

To show the number of unread conversations, add the `data-pos-chat-unread-conversations` attribute to any element. The module puts the number in it and hides the element when there are none:

```html
<a href="/inbox">Inbox <span class="my-badge" data-pos-chat-unread-conversations hidden></span></a>
```

For anything else, like a toast, listen to the events:

```js
document.addEventListener('pos-chat:message', event => {
  // the text as typed - escape it before putting it into HTML
  if(!event.detail.active){
    showToast(`${event.detail.sender_name}: ${event.detail.message}`, event.detail.url);
  }
});

document.addEventListener('pos-chat:unread', event => {
  console.log(event.detail.unread_conversations);
});
```

| Event | When | `event.detail` |
|---|---|---|
| `pos-chat:message` | A new message arrived in one of the user's conversations, sent by someone else. Fired once per message, even if the server delivers it twice | `message_id`, `conversation_id`, `sender_id`, `sender_name`, `message` (the text as typed - escape it before putting it into HTML), `created_at`, `url` (the inbox opened on that conversation), `active` (`true` when the inbox on this page has that conversation open and the tab is visible - you may want to skip the toast then) |
| `pos-chat:unread` | The number of unread conversations changed: on `start()` when you pass `unread_conversations`, when a new message arrives, and when the user reads a conversation (in any tab or on any device) | `unread_conversations` |

The current number is also available as `window.pos.modules.chat.notifications.unread_conversations` (`null` until it's known). `pos-chat:unread` may carry more counters in the future, so read the one you need by name.

Each time the connection opens, and again whenever it comes back after being lost (a laptop waking up, a network change), the client reads the current number from `GET /api/chat/notifications.json` (`{ "unread_conversations": 3, "unread_at": "..." }`), so the badge is right even if something changed while it wasn't connected. Messages sent meanwhile don't fire `pos-chat:message` afterwards. You can call the endpoint yourself too, for example from a native app.

The [example application](#example-application) renders it in its layout and shows the number on the Inbox link in its header (`app/views/partials/header.liquid`).

If your app sets `window.pos.profile` itself, it's kept - the module only adds the `id` when it's missing.

#### CRUD commands 

...


## Customizing the looks

The chat module by default uses styling provided by the platformOS Common Styling module. It's built with the intention to easily overwrite the colors, fonts and spacings by overwriting the CSS variables stored in `modules/common-styling/style/pos-config.css`. You can create your own `.css` file and just overwrite any value of any variable. If you need more CSS customization you can obviously just use standard styling techniques and if you need to change the HTML structure even further, you can overwrite any liquid partial used in the chat.

