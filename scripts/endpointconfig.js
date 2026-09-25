function normalizeBaseUrl(value, fallback = '') {
  if (!value || typeof value !== 'string') {
    return fallback;
  }
  return value.trim().replace(/\/+$/, '');
}

function getConfigValue(key, fallback = '') {
  const config = typeof window !== 'undefined' ? window.hlx?.config : undefined;
  const nestedValue = key
    .split('.')
    .reduce((value, segment) => value?.[segment], config);
  const value = config?.[key] ?? nestedValue ?? fallback;
  return normalizeBaseUrl(value, fallback);
}

// Endpoint configuration functions
function getAEMPublish() {
  return getConfigValue(
    'aem.publish',
    typeof window !== 'undefined' ? window.location.origin : '',
  );
}

function getAEMAuthor() {
  return getConfigValue(
    'aem.author',
    typeof window !== 'undefined' ? window.location.origin : '',
  );
}

function isUniversalEditorMode() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  const wcmmode = params.get('wcmmode');

  return (
    document.documentElement.classList.contains('adobe-ue-edit')
    || wcmmode === 'edit'
    || wcmmode === 'preview'
    || window.location.pathname.includes('/editor.html')
    || window.location.pathname.includes('/editor')
  );
}

function isDocumentAuthoringMode() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  return (
    document.documentElement.classList.contains('da-live')
    || document.body?.dataset?.daLive === 'true'
    || params.has('da-live')
    || params.has('da_live')
    || params.has('document-authoring')
    || params.has('adobe_authoring')
  );
}

function isAuthoringMode() {
  return isUniversalEditorMode() || isDocumentAuthoringMode();
}

export {
  getAEMPublish,
  getAEMAuthor,
  isUniversalEditorMode,
  isDocumentAuthoringMode,
  isAuthoringMode,
};
