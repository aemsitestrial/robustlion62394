# Header Block Analysis

## Executive Summary

The project Header is a global, fragment-driven navigation block. It is not added manually through the Universal Editor Add Component menu. The page bootstrap creates it automatically, and the Header loads its content from the `/nav` document.

The main runtime files are:

- `blocks/header/header.js` - fetches and decorates the navigation.
- `blocks/header/header.css` - styles the Header, responsive menu, dropdowns, and breadcrumbs.
- `scripts/aem.js` - creates and loads the global Header block.
- `scripts/scripts.js` - calls the Header loader during page startup.
- `blocks/fragment/fragment.js` - fetches and decorates the `/nav` fragment.

## 1. How the Header Is Loaded

During lazy page loading, `scripts/scripts.js` calls:

```js
loadHeader(doc.querySelector('header'));
```

The `loadHeader()` function in `scripts/aem.js` creates a Header block dynamically and loads its JavaScript and CSS. Conceptually, the page begins with:

```html
<header>
  <div class="header block"></div>
</header>
```

The Header decorator then replaces the empty block with the rendered navigation.

Because this is a global shell component, authors do not add `Header` to each page body through Add Component.

## 2. Navigation Source

The Header reads an optional `nav` metadata value:

```js
const navMeta = getMetadata('nav');
const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
```

If no metadata is present, the default source is:

```text
/nav
```

`loadFragment()` normalizes the path and requests:

```text
/nav.plain.html
```

The fetched HTML is placed into a temporary `<main>`, decorated using the normal block pipeline, and returned to `header.js`.

A page can use another navigation source with metadata such as:

```html
<meta name="nav" content="/campaign-nav">
```

That page will load:

```text
/campaign-nav.plain.html
```

## 3. Expected Navigation Document Structure

The Header expects the first three top-level sections of the navigation document in this order:

1. Brand
2. Navigation sections
3. Tools

The runtime assigns classes by position:

```html
<nav id="nav">
  <div class="nav-brand">...</div>
  <div class="nav-sections">...</div>
  <div class="nav-tools">...</div>
</nav>
```

This positional contract is important. If the `/nav` document adds or reorders top-level sections, the Header can classify content incorrectly.

### Brand section

The brand normally contains the site logo or name as a link. The Header removes generic button classes from that link so it behaves as a brand link instead of a CTA button.

### Navigation sections

The navigation section normally contains:

```html
<div class="default-content-wrapper">
  <ul>
    <li><a href="/examples">Examples</a></li>
    <li>
      <a href="/documentation">Documentation</a>
      <ul>
        <li><a href="/documentation/getting-started">Getting Started</a></li>
      </ul>
    </li>
  </ul>
</div>
```

A top-level item containing a nested `<ul>` becomes a dropdown with `nav-drop`, `aria-haspopup`, and `aria-expanded`.

### Tools section

The tools section can contain search and other utility links. An empty link whose URL contains `search` receives:

```html
aria-label="Search"
```

## 4. DOM Decoration Flow

The Header decorator performs these steps:

1. Read the navigation metadata or use `/nav`.
2. Fetch and decorate the plain HTML fragment.
3. Stop if the fragment cannot be loaded and log a warning.
4. Clear the empty Header block.
5. Create `<nav id="nav">`.
6. Move the fragment's top-level elements into the new navigation.
7. Assign `nav-brand`, `nav-sections`, and `nav-tools` based on order.
8. Normalize brand and navigation link classes.
9. Mark nested navigation items as dropdowns.
10. Create the mobile hamburger.
11. Add the navigation wrapper.
12. Optionally append breadcrumbs.

The final page structure is approximately:

```html
<header>
  <div class="header block">
    <div class="nav-wrapper">
      <nav id="nav" aria-expanded="false">
        <div class="nav-hamburger">...</div>
        <div class="nav-brand">...</div>
        <div class="nav-sections">...</div>
        <div class="nav-tools">...</div>
      </nav>
    </div>
  </div>
</header>
```

## 5. Desktop Behavior

The desktop breakpoint is `900px`.

At desktop widths:

- the hamburger is hidden
- brand, navigation sections, and tools use a horizontal flex layout
- navigation links remain visible
- dropdown sections are positioned below their parent item
- clicking a dropdown closes other open dropdowns
- the Header wrapper remains fixed at the top of the viewport

Dropdown visibility is controlled by:

```css
.nav-drop[aria-expanded='true'] > ul {
  display: block;
}
```

The Header uses `position: fixed`, not `position: sticky`, on `.nav-wrapper`.

## 6. Mobile Behavior

Below `900px`:

- the hamburger button is visible
- navigation sections are hidden until the menu opens
- the navigation expands to the available viewport height
- page scrolling is disabled while the menu is open
- the button label changes between `Open navigation` and `Close navigation`

The state is represented by:

```html
<nav id="nav" aria-expanded="true">
```

The hamburger button also receives the matching state:

```html
<button
  aria-controls="nav"
  aria-expanded="true"
  aria-label="Close navigation">
```

## 7. Accessibility and Interaction

### Hamburger

The hamburger is a real button with:

- `type="button"`
- `aria-controls="nav"`
- `aria-expanded`
- an action-specific `aria-label`

### Dropdowns

Dropdown items receive:

- `nav-drop`
- `tabindex="0"` on desktop
- `aria-haspopup="true"`
- `aria-expanded="false"` or `true`

Users can open a focused dropdown with `Enter` or `Space`.

### Escape and focus

Pressing `Escape`:

- closes an open desktop dropdown, or
- closes the mobile navigation
- returns focus to the relevant control

When focus leaves the navigation, the current open menu is closed.

### Accessibility considerations

The current Header is functional, but the dropdown trigger is a focusable list item rather than a native button. A future improvement would be to render a button for each dropdown trigger and associate it with the submenu using `aria-controls`.

## 8. Breadcrumbs

Breadcrumbs are enabled through page metadata:

```html
<meta name="breadcrumbs" content="true">
```

When enabled, the Header:

1. Finds the current page in the navigation tree.
2. Builds parent breadcrumbs from nested list items.
3. Adds a Home item using the configured placeholder.
4. Marks the current page with:

```html
aria-current="page"
```

The final breadcrumb is rendered as text rather than a link.

## 9. Universal Editor and Authoring

The global Header does not have `blocks/header/_header.json` because it is not a normal authorable block instance. Its content is authored in the `/nav` document.

In Universal Editor:

1. Open `/nav.html`.
2. Edit the brand, navigation links, nested dropdowns, or tools.
3. Save and publish `/nav`.
4. Publish the consuming page if required.
5. Refresh the page using the Header.

The page does not need a Header component added through Add Component.

## 10. Presentation Test Plan

### Navigation loading

1. Open the published page.
2. Open DevTools Network.
3. Refresh the page.
4. Confirm `/nav.plain.html` returns `200`.
5. Confirm the page contains `nav#nav`.
6. Confirm the console has no Header errors.

### Desktop

1. Use a viewport at least `900px` wide.
2. Confirm the hamburger is hidden.
3. Confirm the brand, navigation, and tools are visible.
4. Click a navigation item with a nested submenu.
5. Confirm `aria-expanded` changes to `true`.
6. Open another dropdown and confirm the first closes.
7. Press `Escape` and confirm the dropdown closes.

### Mobile

1. Use a viewport below `900px`, such as `375px` wide.
2. Confirm navigation sections are initially hidden.
3. Click the hamburger.
4. Confirm the sections become visible.
5. Confirm body scrolling is disabled.
6. Confirm the button changes to `Close navigation`.
7. Press `Escape` and confirm the menu closes and focus returns to the button.

### Breadcrumbs

1. Enable `breadcrumbs` metadata.
2. Refresh the page.
3. Confirm breadcrumbs appear on desktop.
4. Confirm the current page has `aria-current="page"`.
5. Confirm the final breadcrumb is not a link.

## 11. Risks and Recommended Improvements

### Current risks

- The first three `/nav` sections are identified by position.
- A missing or malformed `/nav.plain.html` can prevent the Header from rendering.
- Search accessibility depends on the navigation document using a search URL.
- Dropdown triggers are list items rather than native buttons.
- The fixed Header depends on the reserved Header height remaining accurate.

### Recommended improvements

1. Add a validation warning when `/nav` does not contain brand, sections, and tools.
2. Replace positional section mapping with explicit authoring markers if the navigation structure becomes more complex.
3. Use native buttons for dropdown triggers.
4. Add automated tests for missing navigation, malformed navigation, mobile state, dropdown state, and breadcrumb generation.
5. Keep `/nav` as the single source of truth for site-wide navigation.
6. Document and test alternate navigation metadata only when a page genuinely needs a different navigation tree.

## Presentation Summary

The Header is a global site shell, not a regular page component. The page bootstrap creates it automatically. The Header fetches `/nav.plain.html`, classifies its brand, sections, and tools, then adds responsive behavior, dropdowns, search accessibility, and optional breadcrumbs.

For authors, the main workflow is:

```text
Edit /nav -> Publish /nav -> Refresh a consuming page -> Test desktop and mobile
```
