(() => {
  'use strict';

  const SHELL_ASSET_VERSION = '2026_03_25_4';
  const SELECTED_BUNDLE_ID_KEY = 'arrows:selectedBundleId';
  const SETTINGS_PAGE_SELECTOR = '.settings-page';
  const SETTINGS_TABLE_SELECTOR = '.settings-table';
  const SETTINGS_ROW_ID = 'bundle-shell-version-row';

  const versions = [
    {
      id: '1_4',
      title: '1.4',
      script: 'bundle.js',
      style: 'style.css',
      gameVersion: '1_4',
      isDefault: true,
    },
    {
      id: '1_2_1',
      title: '1.2.1',
      script: 'bundle-1_2_1.js',
      style: 'style-v1_2.css',
      gameVersion: '1_2_1',
      isDefault: false,
    },
    {
      id: '1_3',
      title: '1.3',
      script: 'bundle-1_3.js',
      style: 'style-1_3.css',
      gameVersion: '1_3',
      isDefault: false,
    },
  ];

  const i18n = {
    en: {
      versionLabel: 'Game version',
    },
    ru: {
      versionLabel: 'Версия игры',
    },
    ua: {
      versionLabel: 'Версія гри',
    },
    by: {
      versionLabel: 'Версія гульні',
    },
    fr: {
      versionLabel: 'Version du jeu',
    },
  };

  const languageAliases = {
    en: 'en',
    ru: 'ru',
    uk: 'ua',
    ua: 'ua',
    be: 'by',
    by: 'by',
    fr: 'fr',
  };

  window.bundleShellVersion = SHELL_ASSET_VERSION;

  function getDefaultVersion() {
    for (let i = 0; i < versions.length; i += 1) {
      if (versions[i].isDefault) return versions[i];
    }
    return versions[0];
  }

  function findVersionById(id) {
    for (let i = 0; i < versions.length; i += 1) {
      if (versions[i].id === id) return versions[i];
    }
    return null;
  }

  function readLocalStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeLocalStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Ignore storage failures and continue with the in-memory selection.
    }
  }

  function removeLocalStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // Ignore storage failures and continue with the in-memory selection.
    }
  }

  function resolveLanguageCode(value) {
    if (typeof value !== 'string') return null;

    const normalizedValue = value.toLowerCase();
    const shortCode = normalizedValue.split('-')[0];

    if (Object.prototype.hasOwnProperty.call(languageAliases, normalizedValue)) {
      return languageAliases[normalizedValue];
    }

    if (Object.prototype.hasOwnProperty.call(languageAliases, shortCode)) {
      return languageAliases[shortCode];
    }

    return null;
  }

  function getCurrentLanguage() {
    const storedLanguage = resolveLanguageCode(readLocalStorage('lang'));
    if (storedLanguage !== null) return storedLanguage;

    const htmlLanguage = resolveLanguageCode(document.documentElement.lang);
    if (htmlLanguage !== null) return htmlLanguage;

    if (Array.isArray(navigator.languages)) {
      for (let i = 0; i < navigator.languages.length; i += 1) {
        const language = resolveLanguageCode(navigator.languages[i]);
        if (language !== null) return language;
      }
    }

    const navigatorLanguage = resolveLanguageCode(navigator.language);
    if (navigatorLanguage !== null) return navigatorLanguage;

    return 'en';
  }

  function getCopy() {
    const language = getCurrentLanguage();
    return i18n[language] || i18n.en;
  }

  function resolveSelectedVersion() {
    const selectedBundleId = readLocalStorage(SELECTED_BUNDLE_ID_KEY);
    const selectedVersion = findVersionById(selectedBundleId);

    if (selectedVersion !== null) return selectedVersion;
    if (selectedBundleId !== null) removeLocalStorage(SELECTED_BUNDLE_ID_KEY);

    return getDefaultVersion();
  }

  function loadVersionAssets(version) {
    window.gameVersion = version.gameVersion;

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = `${version.style}?v=${version.gameVersion}`;
    styleLink.setAttribute('data-bundle-id', version.id);
    document.head.appendChild(styleLink);

    const bundleScript = document.createElement('script');
    bundleScript.src = `${version.script}?v=${version.gameVersion}`;
    bundleScript.async = false;
    bundleScript.setAttribute('data-bundle-id', version.id);
    document.body.appendChild(bundleScript);
  }

  function createVersionSelect(selectedVersion) {
    const selectElement = document.createElement('select');
    selectElement.classList.add('lang-select');

    for (let i = 0; i < versions.length; i += 1) {
      const optionElement = document.createElement('option');
      optionElement.value = versions[i].id;
      optionElement.textContent = versions[i].title;
      selectElement.appendChild(optionElement);
    }

    selectElement.value = selectedVersion.id;
    selectElement.addEventListener('change', () => {
      if (selectElement.value === selectedVersion.id) return;
      writeLocalStorage(SELECTED_BUNDLE_ID_KEY, selectElement.value);
      window.location.reload();
    });

    return selectElement;
  }

  function createSettingsRow(selectedVersion) {
    const copy = getCopy();
    const rowElement = document.createElement('tr');
    rowElement.id = SETTINGS_ROW_ID;

    const nameCell = document.createElement('td');
    nameCell.classList.add('setting-name');
    nameCell.textContent = `${copy.versionLabel}:`;
    rowElement.appendChild(nameCell);

    const valueCell = document.createElement('td');
    valueCell.classList.add('setting-value');
    valueCell.appendChild(createVersionSelect(selectedVersion));
    rowElement.appendChild(valueCell);

    return rowElement;
  }

  function findSettingsInsertTarget(settingsPage, settingsTable) {
    const logoutButton = settingsPage.querySelector('.logout-button');
    if (logoutButton === null) return null;

    const logoutRow = logoutButton.closest('tr');
    if (logoutRow !== null && logoutRow.parentNode === settingsTable) return logoutRow;

    return null;
  }

  function ensureSettingsTable(settingsPage) {
    const existingTable = settingsPage.querySelector(SETTINGS_TABLE_SELECTOR);
    if (existingTable !== null) return existingTable;

    const tableElement = document.createElement('table');
    tableElement.classList.add('settings-table');

    const logoutButton = settingsPage.querySelector('.logout-button');
    let logoutContainer = logoutButton === null ? null : logoutButton;

    while (logoutContainer !== null && logoutContainer.parentNode !== null && logoutContainer.parentNode !== settingsPage) {
      logoutContainer = logoutContainer.parentNode;
    }

    if (logoutContainer !== null && logoutContainer.parentNode === settingsPage) {
      settingsPage.insertBefore(tableElement, logoutContainer);
    } else {
      settingsPage.appendChild(tableElement);
    }

    return tableElement;
  }

  function ensureSettingsVersionSelector() {
    const settingsPage = document.querySelector(SETTINGS_PAGE_SELECTOR);
    if (settingsPage === null) return;

    const selectedVersion = resolveSelectedVersion();
    const existingRow = settingsPage.querySelector(`#${SETTINGS_ROW_ID}`);

    if (existingRow !== null) {
      const copy = getCopy();
      const labelCell = existingRow.querySelector('.setting-name');
      const selectElement = existingRow.querySelector('select');
      const nextLabel = `${copy.versionLabel}:`;

      if (labelCell !== null && labelCell.textContent !== nextLabel) {
        labelCell.textContent = nextLabel;
      }
      if (selectElement !== null && selectElement.value !== selectedVersion.id) {
        selectElement.value = selectedVersion.id;
      }
      return;
    }

    const settingsTable = ensureSettingsTable(settingsPage);
    const rowElement = createSettingsRow(selectedVersion);
    const insertTarget = findSettingsInsertTarget(settingsPage, settingsTable);

    if (insertTarget !== null) settingsTable.insertBefore(rowElement, insertTarget);
    else settingsTable.appendChild(rowElement);
  }

  function observePageChanges() {
    const observer = new MutationObserver(() => {
      ensureSettingsVersionSelector();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    ensureSettingsVersionSelector();
  }

  const selectedVersion = resolveSelectedVersion();
  observePageChanges();
  loadVersionAssets(selectedVersion);
})();
