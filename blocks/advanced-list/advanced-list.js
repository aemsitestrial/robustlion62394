import { createOptimizedPicture } from '../../scripts/aem.js';
import { getAEMPublish } from '../../scripts/endpointconfig.js';

/**
 * Robust property extractor reading values across UE dataset attributes,
 * store nodes, and key-value rows without breaking live instrumentation.
 */
function getProp(block, name, fallback = '') {
  const lowerName = name.toLowerCase();
  const normalizedName = lowerName.replace(/[-_\s]/g, '');
  const roots = [block, ...block.querySelectorAll('.advanced-list-ue-store')];

  const readValue = (element) => {
    if (!element) return '';
    const image = element.matches('img') ? element : element.querySelector('picture img, img');
    if (image) return image.getAttribute('src') || image.src;
    const anchor = element.matches('a') ? element : element.querySelector('a[href]');
    if (anchor) return anchor.getAttribute('href') || anchor.textContent.trim();
    return element.dataset.value
      || element.getAttribute('value')
      || element.value
      || element.textContent.trim();
  };

  if (block.dataset[name] !== undefined) return block.dataset[name];
  if (block.dataset[lowerName] !== undefined) return block.dataset[lowerName];

  const propertyElements = roots.flatMap((root) => {
    const descendants = [...root.querySelectorAll('[data-aue-prop]')];
    if (root.matches('[data-aue-prop]')) descendants.unshift(root);
    return descendants;
  });

  const propertyElement = propertyElements.find(
    (element) => element.getAttribute('data-aue-prop').toLowerCase() === lowerName,
  );
  if (propertyElement) {
    const value = readValue(propertyElement);
    if (value) return value;
  }

  // Key-Value row lookup
  const rows = roots.flatMap((root) => [...root.children])
    .filter((row) => !row.classList.contains('advanced-list-container'));
  const targetRow = rows.find((row) => {
    const cols = [...row.children];
    const key = cols[0]?.textContent.trim().toLowerCase().replace(/[-_\s]/g, '');
    return cols.length >= 2 && key === normalizedName;
  });

  if (targetRow) {
    const cols = [...targetRow.children];
    const value = readValue(cols[1]);
    if (value) return value;
  }

  return fallback;
}

function getBoolean(block, name, fallback = false) {
  const val = String(getProp(block, name, fallback)).toLowerCase().trim();
  return val === 'true' || val === 'yes' || val === '1';
}

function normalizePath(path) {
  if (!path) return '/';
  let pathname;
  try {
    pathname = new URL(String(path).trim(), window.location.origin).pathname;
  } catch (error) {
    [pathname] = String(path).split(/[?#]/);
  }

  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/index') return '/';
  if (clean.startsWith('/index/')) return clean.replace(/^\/index/, '');
  return clean;
}

async function fetchQueryIndex() {
  const codeOrigin = new URL(import.meta.url).origin;
  const currentOrigin = window.location.origin;
  const host = currentOrigin.includes('.adobeaemcloud.com')
    ? codeOrigin
    : (getAEMPublish() || currentOrigin);

  try {
    const resp = await fetch(new URL('/query-index.json', host));
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok || !contentType.includes('application/json')) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : (data.data || []);
  } catch (err) {
    return [];
  }
}

function parseFixedOrManualItems(source) {
  if (!source) return [];
  const links = [...source.querySelectorAll('a[href]')];
  return links.map((a) => ({
    path: a.getAttribute('href'),
    title: a.textContent.trim() || a.getAttribute('href'),
    description: a.dataset.description || '',
    image: a.querySelector('img')?.src || '',
    tags: a.dataset.tags || '',
  }));
}

/**
 * Filter & Sort Pipeline handling Depth, Tags Scoping, and Priority Tag Deduplication
 */
function filterAndSortItems(items, config) {
  let result = items.filter((item) => item.path);

  if (config.listType === 'children') {
    const parent = normalizePath(config.parentPage || window.location.pathname);
    const targetDepth = Number(config.childDepth) || 1;

    result = result.filter((item) => {
      const itemPath = normalizePath(item.path);
      if (itemPath === parent) return false;
      if (parent !== '/' && !itemPath.startsWith(`${parent}/`)) return false;

      const relativePath = parent === '/'
        ? itemPath.replace(/^\/+/, '')
        : itemPath.slice(parent.length + 1);
      const depth = relativePath.split('/').filter(Boolean).length;
      return depth === targetDepth;
    });
  } else if (config.listType === 'tags') {
    const rawTags = Array.isArray(config.tags) ? config.tags.join(',') : String(config.tags || '');
    const authoredTags = rawTags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const scopePath = config.tagsParentPage ? normalizePath(config.tagsParentPage) : null;
    const targetDepth = Number(config.tagsChildDepth) || 1;

    // Filter scoped items matching tags
    const candidateItems = result.filter((item) => {
      const itemPath = normalizePath(item.path);
      if (scopePath && !itemPath.startsWith(`${scopePath}/`)) return false;

      if (scopePath) {
        const relativePath = scopePath === '/'
          ? itemPath.replace(/^\/+/, '')
          : itemPath.slice(scopePath.length + 1);
        const depth = relativePath.split('/').filter(Boolean).length;
        if (depth !== targetDepth) return false;
      }

      const itemTags = String(item.tags || '').toLowerCase().split(',').map((t) => t.trim());
      return config.tagMatch === 'all'
        ? authoredTags.every((t) => itemTags.some((it) => it.includes(t)))
        : authoredTags.some((t) => itemTags.some((it) => it.includes(t)));
    });

    // Tag result type: "1 result each tag" deduplication
    if (config.tagResultType === '1-each' && authoredTags.length > 0) {
      const uniqueByTag = [];
      const usedPaths = new Set();

      authoredTags.forEach((tag) => {
        const matchingItem = candidateItems.find((item) => {
          if (usedPaths.has(item.path)) return false;
          const itemTags = String(item.tags || '').toLowerCase().split(',').map((t) => t.trim());
          return itemTags.some((it) => it.includes(tag));
        });

        if (matchingItem) {
          usedPaths.add(matchingItem.path);
          uniqueByTag.push({
            ...matchingItem,
            primaryTag: tag, // Overline display name
          });
        }
      });
      result = uniqueByTag;
    } else {
      result = candidateItems;
    }
  }

  // Sort
  result.sort((a, b) => {
    const keyA = config.orderBy === 'modified' ? (a.lastModified || 0) : (a.title || '');
    const keyB = config.orderBy === 'modified' ? (b.lastModified || 0) : (b.title || '');
    const cmp = String(keyA).localeCompare(String(keyB), undefined, { numeric: true });
    return config.sortOrder === 'descending' ? -cmp : cmp;
  });

  return config.maxItems > 0 ? result.slice(0, config.maxItems) : result;
}

function applyPersonalizationHook(items, config) {
  if (!config.personalizationEnabled) return items;
  // Personalization logic hook placeholder
  return items;
}

function formatDate(rawDate, format) {
  if (!rawDate) return '';
  const numeric = typeof rawDate === 'number' || /^\d+(\.\d+)?$/.test(String(rawDate).trim());
  const timestamp = numeric ? Number(rawDate) * (Number(rawDate) < 1e12 ? 1000 : 1) : rawDate;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.valueOf())) return String(rawDate);

  const day = String(parsed.getDate()).padStart(2, '0');
  const monthNum = String(parsed.getMonth() + 1).padStart(2, '0');
  const monthShort = parsed.toLocaleDateString('en-US', { month: 'short' });
  const year = parsed.getFullYear();

  if (format === 'MM-DD-YYYY') return `${monthNum}-${day}-${year}`;
  if (format === 'MMM d, yyyy') return `${monthShort} ${parsed.getDate()}, ${year}`;
  return `${day}-${monthNum}-${year}`;
}

function renderItem(item, config, index) {
  const li = document.createElement('li');
  li.className = `advanced-list-item card-color-${config.cardColor}`;
  if (config.listStyle === 'hero-card' && index === 0) {
    li.classList.add('hero-item');
  }

  const card = document.createElement('div');
  card.className = 'advanced-list-card';

  // 1. Media
  if (!config.hideImage && item.image) {
    const picContainer = document.createElement('div');
    picContainer.className = 'advanced-list-media';
    picContainer.append(createOptimizedPicture(item.image, item.title || '', false, [{ width: '600' }]));
    card.append(picContainer);
  }

  const body = document.createElement('div');
  body.className = 'advanced-list-body';

  // 2. Overline Tag
  if (config.showEyebrow && config.displayTags) {
    const eyebrowText = item.primaryTag || (String(item.tags || '').split(',')[0] || '').trim();
    if (eyebrowText) {
      const overline = document.createElement('span');
      overline.className = 'advanced-list-overline';
      overline.textContent = eyebrowText.replace(/^.*:/, '').toUpperCase();
      body.append(overline);
    }
  }

  // 3. Title
  if (!config.hideTitle) {
    const title = document.createElement('h3');
    title.className = 'advanced-list-card-title';
    if (config.linkItems) {
      const link = document.createElement('a');
      link.href = normalizePath(item.path);
      link.textContent = item.title || item.name || 'Untitled';
      title.append(link);
    } else {
      title.textContent = item.title || item.name || 'Untitled';
    }
    body.append(title);
  }

  // 4. Description
  if (config.showDescription && item.description) {
    const desc = document.createElement('p');
    desc.className = 'advanced-list-description';
    desc.textContent = item.description;
    body.append(desc);
  }

  // 5. Meta Footer
  const meta = document.createElement('div');
  meta.className = 'advanced-list-meta';

  if (config.showDate && item.lastModified) {
    const date = document.createElement('time');
    date.className = 'advanced-list-date';
    date.textContent = formatDate(item.lastModified, config.dateFormat);
    meta.append(date);
  }

  if (config.authorDetails && item.author) {
    const author = document.createElement('span');
    author.className = 'advanced-list-author';
    author.textContent = item.author;
    meta.append(author);
  }

  if (meta.children.length) body.append(meta);

  card.append(body);
  li.append(card);
  return li;
}

export default async function decorate(block) {
  const listType = String(getProp(block, 'listType', 'children')).toLowerCase().trim();

  const config = {
    listType,
    personalizationEnabled: getBoolean(block, 'personalizationEnabled', false),
    parentPage: getProp(block, 'parentPage'),
    childDepth: getProp(block, 'childDepth', '1'),
    tagsParentPage: getProp(block, 'tagsParentPage'),
    tagsChildDepth: getProp(block, 'tagsChildDepth', '1'),
    tags: getProp(block, 'tags'),
    tagMatch: getProp(block, 'tagMatch', 'any'),
    tagResultType: getProp(block, 'tagResultType', 'all'),
    orderBy: getProp(block, 'orderBy', 'title'),
    sortOrder: getProp(block, 'sortOrder', 'ascending'),
    maxItems: Number(getProp(block, 'maxItems', '4')) || 4,
    linkItems: getBoolean(block, 'linkItems', true),
    cardColor: getProp(block, 'cardColor', 'grey').toLowerCase(),
    title: getProp(block, 'title'),
    description: getProp(block, 'description'),
    viewAllText: getProp(block, 'viewAllText'),
    viewAllLink: getProp(block, 'viewAllLink'),
    listStyle: getProp(block, 'listStyle', 'card-m-scroll').toLowerCase(),
    showEyebrow: getBoolean(block, 'showEyebrow', true),
    hideTitle: getBoolean(block, 'hideTitle', false),
    showDescription: getBoolean(block, 'showDescription', true),
    hideImage: getBoolean(block, 'hideImage', false),
    showDate: getBoolean(block, 'showDate', false),
    dateFormat: getProp(block, 'dateFormat', 'DD-MM-YYYY'),
    displayTags: getBoolean(block, 'displayTags', true),
    authorDetails: getBoolean(block, 'authorDetails', false),
    showIcon: getBoolean(block, 'showIcon', false),
    reportCtaTitle: getProp(block, 'reportCtaTitle'),
  };

  // Reset and set layout class
  block.className = block.className.replace(/\blist-style-\S+/g, '').trim();
  block.classList.add(`list-style-${config.listStyle}`);

  // UE Store Handling
  let ueStore = block.querySelector('.advanced-list-ue-store');
  if (!ueStore) {
    ueStore = document.createElement('div');
    ueStore.className = 'advanced-list-ue-store';
    ueStore.style.display = 'none';
    while (block.firstElementChild) {
      ueStore.append(block.firstElementChild);
    }
  }

  // Clear live elements on re-render
  [...block.querySelectorAll('.advanced-list-header, .advanced-list-container')].forEach((el) => el.remove());

  // Render Header Lockup
  if (config.title || config.description || (config.viewAllText && config.viewAllLink)) {
    const header = document.createElement('div');
    header.className = 'advanced-list-header';

    if (config.title) {
      const h2 = document.createElement('h2');
      h2.className = 'advanced-list-heading';
      h2.textContent = config.title;
      header.append(h2);
    }

    if (config.viewAllText && config.viewAllLink) {
      const cta = document.createElement('a');
      cta.className = 'advanced-list-cta button';
      cta.href = normalizePath(config.viewAllLink);
      cta.textContent = config.viewAllText;
      if (config.reportCtaTitle) cta.setAttribute('title', config.reportCtaTitle);
      header.append(cta);
    }

    block.append(header);
  }

  // Fetch Items
  let items = [];
  if (config.listType === 'fixed' || config.listType === 'manual') {
    items = parseFixedOrManualItems(ueStore);
  } else {
    const rawIndex = await fetchQueryIndex();
    items = filterAndSortItems(rawIndex, config);
  }

  items = applyPersonalizationHook(items, config);

  // Render Grid
  const ul = document.createElement('ul');
  ul.className = 'advanced-list-container';

  if (!items.length) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'advanced-list-empty';
    emptyLi.textContent = 'No matching pages found.';
    ul.append(emptyLi);
  } else {
    items.forEach((item, index) => ul.append(renderItem(item, config, index)));
  }

  block.append(ueStore, ul);
}
