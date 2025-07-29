/// <reference path="./types.js" />

/**
 * Displays a temporary badge on the extension icon to indicate success or failure
 * @param {Object} options
 * @param {boolean} [options.success=true] - Whether the operation was successful
 * @credit https://github.com/chitsaou/copy-as-markdown
 */
async function flashBadge({ success = true }) {
	const text = success ? '✔' : '✘';
	const color = success ? 'hsl(135, 70%, 30%)' : 'hsl(0, 80%, 40%)';
	const transparent = 'rgba(0, 0, 0, 0)';
	const timeout = 1000;

	try {
		await chrome.action.setBadgeText({ text: text });
		await chrome.action.setBadgeBackgroundColor({ color: color });

		setTimeout(async () => {
			await chrome.action.setBadgeText({ text: '' });
			await chrome.action.setBadgeBackgroundColor({ color: transparent });
		}, timeout);
	}
	catch (error) {
		console.error('Failed to update badge:', error);
	}
}

/**
 * Sets a working indicator badge showing "..." to indicate an operation in progress
 */
async function setWorkingBadge() {
	try {
		await chrome.action.setBadgeText({ text: '...' });
		await chrome.action.setBadgeBackgroundColor({ color: 'hsl(225, 100%, 60%)' });
	}
	catch (error) {
		console.error('Failed to set working badge:', error);
	}
}

/**
 * Gets all currently selected/highlighted tabs in the current window
 * @returns {Promise<ChromeTab[]>} Array of selected tabs
 */
async function getSelectedTabs() {
	try {
		const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });

		console.group('Tabs obtained.');
		tabs.forEach((tab) => console.log(tab.id, tab.url, tab.title));
		console.groupEnd();

		// It's crucial to sort by index to have a predictable starting point
		return tabs.toSorted((a, b) => a.index - b.index);
	}
	catch (error) {
		console.error('Failed to get selected tabs:', error);
		return [];
	}
}

/**
 * Sorts the currently selected tabs alphabetically by URL
 */
async function sortSelectedTabsByUrl() {
	try {
		await setWorkingBadge();
		const tabs = await getSelectedTabs();
		if (tabs.length < 2) {
			await flashBadge({ success: true });
			return;
		}

		console.group('Sorting tabs...');
		tabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		const sortedTabs = tabs.toSorted((a, b) => {
			const urlA = a.url || '';
			const urlB = b.url || '';
			return urlA.localeCompare(urlB);
		});
		const sortedTabIds = sortedTabs.map((tab) => tab.id);

		// Align tabs to the right edge of the selected tabs
		const rightmostIndex = Math.max(...tabs.map(tab => tab.index));
		const startIndex = rightmostIndex - sortedTabIds.length + 1;
		await chrome.tabs.move(sortedTabIds, { index: startIndex });

		console.group('Sorted!');
		sortedTabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		await flashBadge({ success: true });
	}
	catch (error) {
		console.error('Error sorting tabs by URL:', error);
		await flashBadge({ success: false });
	}
}

/**
 * Fetches date information for tabs using the heliotropium extension
 * @param {ChromeTab[]} tabs
 * @returns {Promise<Map<number, TabDateInfo>>} A map where keys are tab IDs and values are date info objects
 */
async function fetchTabDates(tabs) {
	const unloadedTabs = tabs.filter((tab) => tab.discarded || tab.status !== 'complete');

	if (unloadedTabs.length > 0) {
		const RELOAD_TIMEOUT = 15000;

		const reloadPromises = unloadedTabs.map((tab) => {
			return Promise.race([
				new Promise((resolve) => {
					const listener = (tabId, changeInfo) => {
						if (tabId === tab.id && changeInfo.status === 'complete') {
							chrome.tabs.onUpdated.removeListener(listener);
							resolve({ status: 'reloaded', tabId: tab.id });
						}
					};
					chrome.tabs.onUpdated.addListener(listener);
					chrome.tabs.reload(tab.id);
				}),
				new Promise(resolve => {
					setTimeout(() => {
						resolve({ status: 'timeout', tabId: tab.id });
					}, RELOAD_TIMEOUT);
				})
			]);
		});

		const results = await Promise.all(reloadPromises);
		console.log('Tab reload results:', results);
	}

	const tabIds = tabs.map((tab) => tab.id);
	const manifest = chrome.runtime.getManifest();
	const heliotropiumConfig = manifest.externals?.heliotropium;

	// Set a default map value as a fallback
	const tabInfoMap = new Map(tabs.map((tab) => [tab.id, {
		tabId: tab.id,
		url: tab.url,
		title: tab.title,
		dateString: null,
		date: null
	}]));

	if (!heliotropiumConfig) {
		console.error("Heliotropium configuration is missing in manifest.json");
		return tabInfoMap;
	}

	const { FIREFOX_EXTENSION_ID, CHROME_EXTENSION_ID } = heliotropiumConfig;
	const extensionId = navigator.userAgent.includes('Firefox')
		? FIREFOX_EXTENSION_ID
		: CHROME_EXTENSION_ID;

	try {
		const response = await chrome.runtime.sendMessage(extensionId, { action: 'get-dates', tabIds });

		if (!response || response.error || !Array.isArray(response.data)) {
			console.log('No response, error, or invalid data from Heliotropium:', response?.error || response);
			return tabInfoMap;
		}

		const dateMap = new Map(response.data.map((item) => [item.tabId, item]));
		// Merge fetched data with fallback data to ensure all tabs are included.
		for (const tab of tabs) {
			if (dateMap.has(tab.id)) {
				tabInfoMap.set(tab.id, dateMap.get(tab.id));
			}
		}
		return tabInfoMap;

	}
	catch (error) {
		console.log('Failed to fetch tab dates. Heliotropium might not be installed.', error);
		return tabInfoMap;
	}
}

/**
 * Creates a comparable Date object from a ParsedDate object
 * Returns null if the date is invalid or incomplete
 * @param {ParsedDate | null} dateObj
 * @returns {Date | null}
 */
function getComparableDate(dateObj) {
	if (!dateObj || dateObj.year == null || dateObj.month == null || dateObj.day == null) {
		return null;
	}
	// Month is 0-indexed in JavaScript's Date object
	return new Date(Date.UTC(dateObj.year, dateObj.month - 1, dateObj.day));
}

/**
 * Sorts the currently selected tabs by date using data from heliotropium extension
 */
async function sortSelectedTabsByDate() {
	try {
		await setWorkingBadge();
		const tabs = await getSelectedTabs();
		if (tabs.length < 2) {
			await flashBadge({ success: true });
			return;
		}

		console.group('Sorting tabs...');
		tabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		const tabDataMap = await fetchTabDates(tabs);

		// Sort the original tabs array using the fetched date data
		// This is the robust sorting logic
		const sortedTabs = [...tabs].sort((a, b) => {
			const tabAData = tabDataMap.get(a.id);
			const tabBData = tabDataMap.get(b.id);
			const dateA = getComparableDate(tabAData?.date);
			const dateB = getComparableDate(tabBData?.date);

			// Both have dates: sort chronologically
			if (dateA && dateB) {
				return dateA - dateB;
			}

			// Only A has a date: A comes first
			if (dateA) return -1;
			// Only B has a date: B comes first
			if (dateB) return 1;
			// Neither has a date: keep original relative order
			return 0;
		});

		const sortedTabIds = sortedTabs.map((tab) => tab.id);

		// Align tabs to the right edge of the selected tabs
		const rightmostIndex = Math.max(...tabs.map(tab => tab.index));
		const startIndex = rightmostIndex - sortedTabIds.length + 1;
		await chrome.tabs.move(sortedTabIds, { index: startIndex });

		console.group('Sorted!');
		sortedTabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		await flashBadge({ success: true });
	}
	catch (error) {
		console.error('Error sorting tabs by date:', error);
		await flashBadge({ success: false });
	}
}

chrome.action.onClicked.addListener(async () => {
	// fixme: use `sortSelectedTabsByUrl()` by default. change to `sortSelectedTabsByDate()` if heliotropium is installed
	await sortSelectedTabsByDate();
});

chrome.commands.onCommand.addListener(async (command) => {
	if (command === 'sort-tabs-by-url') {
		await sortSelectedTabsByUrl();
	}
	if (command === 'sort-tabs-by-date') {
		await sortSelectedTabsByDate();
	}
});

/**
 * Detects if the system is in dark mode
 * @returns {boolean} True if dark mode is enabled, false otherwise
 */
function isDarkMode() {
	if (typeof window !== 'undefined' && 'matchMedia' in window) {
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}
	return false;
}

/**
 * Updates the extension icon based on dark mode and enables/disables the extension
 * based on the number of selected tabs
 */
async function updateIcon() {
	const icon = isDarkMode() ? 'icons/icon_white.png' : 'icons/icon_black.png';
	try {
		await chrome.action.setIcon({ path: icon });

		const tabs = await getSelectedTabs();
		if (tabs.length < 2) {
			await chrome.action.disable();
			return;
		}

		await chrome.action.enable();
	}
	catch (error) {
		console.log(error);
	}
}

chrome.windows.onFocusChanged.addListener(async () => {
	await updateIcon();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
	console.log('Tab activated:', tabId);
	await updateIcon();
});

chrome.tabs.onHighlighted.addListener(async ({ tabIds }) => {
	console.log('Tab highlighted:', tabIds);
	await updateIcon();
});

/**
 * Initializes the extension
 */
function initialize() {
	// Note: top-level await is not supported in service workers so this has to be a promise chain
	updateIcon().catch((error) => {
		console.log('Error on initialization:', error);
	});
}

initialize();
