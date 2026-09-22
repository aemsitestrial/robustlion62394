function getFieldValue(row) {
  return row?.firstElementChild?.textContent?.trim() || row?.textContent?.trim() || '';
}

function createIcon(pathData, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', label ? 'false' : 'true');
  svg.setAttribute('focusable', 'false');
  if (label) svg.setAttribute('aria-label', label);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}

function enableVoiceSearch(button, input) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    button.hidden = true;
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = document.documentElement.lang || 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  button.addEventListener('click', () => {
    recognition.start();
    button.classList.add('is-listening');
  });

  recognition.addEventListener('result', (event) => {
    input.value = event.results[0][0].transcript;
    input.focus();
  });

  recognition.addEventListener('end', () => {
    button.classList.remove('is-listening');
  });

  recognition.addEventListener('error', () => {
    button.classList.remove('is-listening');
  });
}

export default function decorate(block) {
  const rows = [...block.children];
  const [titleText, placeholder, endpoint, voiceValue] = rows.map(getFieldValue);
  const voiceEnabled = voiceValue !== 'false' && voiceValue !== '0';

  const title = document.createElement('h2');
  title.textContent = titleText || 'Where Next?';

  const form = document.createElement('form');
  form.className = 'ai-search-form';
  form.setAttribute('role', 'search');

  const sparkle = createIcon('M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2zm7 13l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z');
  sparkle.classList.add('ai-search-sparkle');

  const input = document.createElement('input');
  /* Using type="text" and inputMode="search" eliminates native browser search focus rings */
  input.type = 'text';
  input.inputMode = 'search';
  input.name = 'q';
  input.placeholder = placeholder || 'Ask anything';
  input.setAttribute('aria-label', placeholder || 'Search');
  input.autocomplete = 'off';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'ai-search-submit';
  submit.setAttribute('aria-label', 'Submit search');
  submit.append(createIcon('M5 12h13m-6-6 6 6-6 6'));

  form.append(sparkle, input, submit);

  if (voiceEnabled) {
    const voice = document.createElement('button');
    voice.type = 'button';
    voice.className = 'ai-search-voice';
    voice.setAttribute('aria-label', 'Search by voice');
    voice.append(createIcon('M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0m5 5v4m-3 0h6'));
    form.append(voice);
    enableVoiceSearch(voice, input);
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query || !endpoint) return;

    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set('q', query);
    window.location.assign(url.toString());
  });

  block.replaceChildren(title, form);
}
