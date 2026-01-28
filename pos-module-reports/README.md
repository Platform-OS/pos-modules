# Reports Library Module

Provides the functionality to add admin reports to your project. The reports are generated in the background and the user can download the report after it's generated.

## Usage

Let's say we want to create a reports functionality for user profiles in the application.
You should make sure to enforce authentication and permissions checking in all admin pages related to the reports.

We start with the page that will list all profiles reports:

```liquid
--
layout: application
slug: admin/reports/list
---

{% if context.params.type == blank %}
  {% redirect_to '/admin/reports/list?type=profile' %}
{% endif %}

{% assign page = context.params.page | default: 1 | plus: 0 %}
{% assign operation_models = '[]' | parse_json %}
{% assign operation_models = operation_models | add_to_array: params.type %}
{% graphql operations = 'modules/reports/reports/search', limit: 10, page: page, operation_models: operation_models %}

{% render 'admin/reports/list', operations: operations, page: page, type: context.params.type %}
```

And the partial rendered from the page is below. The partial is rendered from the `admin/reports/list` page. The partial uses the information retrieved by the page to display the reports. This information includes the reports that are already generated and the reports that are still in progress. For generated reports, a download button is displayed.

```
<div>
  <h2>Admin actions</h2>

  <div>
    <form action="/admin/reports/profiles" method="post">
      <input type="hidden" name="authenticity_token" value="{{ context.authenticity_token }}" />
      <button type="submit">Export Profiles as CSV</button>
    </form>

    <div>
      <h1>Displaying exports for: {{ type }}</h1>
    </div>

    {% if operations.reports.results.size > 0 %}
      <table>
        <thead>
          <tr>
            <th>
              ID
            </th>
            <th>
              Type
            </th>
            <th>
              Model
            </th>
            <th>
              Status
            </th>
            <th>
              Created At
            </th>
            <th>
              Updated At
            </th>
            <th>
              Document
            </th>
          </tr>
        </thead>
        <tbody>
          {% for operation in operations.reports.results %}
            <tr>
              <td>
                {{ operation.id }}
              </td>
              <td>
                {{ operation.operation_type }}
              </td>
              <td>
                {{ operation.operation_model }}
              </td>
              <td>
                {{ operation.status }}
              </td>
              <td>
                {{ operation.created_at }}
              </td>
              <td>
                {{ operation.updated_at }}
              </td>
              <td>
                {% if operation.files.first != blank %}
                  <a
                    href="{{ operation.files.first.file.url }}"
                  >
                    Download
                  </a>
                {% elsif operation.status == 'done' %}
                  <form
                    action="/admin/reports/download/{{ operation.id }}"
                    method="post"
                    class="inline"
                  >
                    <input type="hidden" name="authenticity_token" value="{{ context.authenticity_token }}" />
                    <button
                      type="submit"
                    >
                      Download
                    </button>
                  </form>
                {% endif %}
              </td>
            </tr>
          {% endfor %}
        </tbody>
      </table>      

      {% assign current_page = operations.reports.current_page | plus: 0 %}

      {% if operations.reports.has_previous_page %}
        {% assign previous_page = current_page | minus: 1 %}
        <a href="/admin/reports/list?page={{ previous_page }}&type={{ type }}">&laquo; Previous Page</a>
      {% endif %}

      {% if operations.reports.has_next_page %}
        {% assign next_page = current_page | plus: 1 %}
        <a href="/admin/reports/list?page={{ next_page }}&type={{ type }}">Next Page &raquo;</a>
      {% endif %}
    {% else %}
      <div>
        <p>No operations found. You may need to export a CSV first.</p>
      </div>
    {% endif %}
  </div>
</div>
```

Below is the page that handles the actual triggering of the report generation, the page where the form for triggering the report submits to.
What is important to note about this page is that it's using the 'modules/profile/commands/profiles/export_all' command. This is a parameter you can change so that you get a report for whatever you want exported.

```
---
layout: application
slug: admin/reports/profiles
method: post
---
{% function admin_user = 'modules/user/queries/user/find', email: 'alex.admin@example.com' %}
{% function admin_user_profile = 'modules/profile/queries/profiles/find', user_id: admin_user.id %}

{% liquid
  assign operation_uuid = '' | uuid
  assign object = '{}' | parse_json | hash_merge: uuid: operation_uuid, creator_id: admin_user_profile.id, user_id: admin_user_profile.user_id, operation_type: 'export_profiles', operation_model: 'profile', options: '{}', retrieve_all_command: 'modules/profile/commands/profiles/export_all'
  function object = 'modules/reports/commands/reports/create', object: object

  if object.valid
    function res = 'modules/core/commands/statuses/create', name: 'app.statuses.report.pending', reference_id: object.id, requester_id: 'report'

    assign object_payload = '{}' | parse_json | hash_merge: actor_id: admin_user_profile.id, object_id: object.id, app_host: context.location.host
    function _ = 'modules/core/commands/events/publish', type: 'report_requested', object: object_payload
  endif
%}

{% redirect_to '/admin/reports/list?type=profile' %}
```

The command that is used to generate the report is below.

```
{% assign rows = '[]' | parse_json %}

{% assign header_row = "id,created_at,updated_at,user_id,avatar,uuid,name,first_name,last_name,slug,email" | split: ',' %}

{%- assign rows = rows | add_to_array: header_row -%}

{%- graphql profiles = 'modules/profile/profiles/search', page: 1, limit: 100 -%}
{%- assign total_pages = profiles.records.total_pages -%}
{%- for i in (1..total_pages) -%}
  {%- if i > 1 -%}
    {%- graphql profiles = 'modules/profile/profiles/search', page: i, limit: 100 -%}
  {%- endif -%}
  {%- for profile in profiles.records.results -%}
    {%- assign row = '[]' | parse_json -%}
    {%- assign row = row | add_to_array: profile.id -%}
    {%- assign row = row | add_to_array: profile.created_at -%}
    {%- assign row = row | add_to_array: profile.updated_at -%}
    {%- assign row = row | add_to_array: profile.properties.user_id -%}
    {%- assign row = row | add_to_array: profile.avatar.photo.versions -%}
    {%- assign row = row | add_to_array: profile.properties.uuid -%}
    {%- assign row = row | add_to_array: profile.properties.name -%}
    {%- assign row = row | add_to_array: profile.properties.first_name -%}
    {%- assign row = row | add_to_array: profile.properties.last_name -%}
    {%- assign row = row | add_to_array: profile.properties.slug -%}
    {%- assign row = row | add_to_array: profile.properties.email -%}
    {%- assign rows = rows | add_to_array: row -%}
  {%- endfor -%}
{%- endfor -%}

{% assign csv_export = rows | to_csv %}

{%- return csv_export -%}
```

The page for downloading the report is below.

```
---
layout: ''
slug: admin/reports/download/:report_id
method: post
---

{% liquid
  assign report_id = params.report_id
  graphql report = 'modules/reports/reports/search', id: report_id, include_documents: true
  assign document_url = report.reports.results.first.documents.first.file.url
%}

{% if document_url %}
  {% redirect_to document_url %}
{% else %}
  {% redirect_to '/404' %}
{% endif %}
```

