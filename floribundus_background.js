/**
 * @file background script for sorting selected tabs by date or URL
 * @author Masataka Yakura
 */
/**
 * @file background script for grouping selected tabs
 * @author Masataka Yakura
 */

/// <reference path="./types.js" />


// Shared utility functions for updating UI


/**
 * Displays a temporary badge on the extension icon to indicate success or failure
 * @param {Object} options
 * @param {boolean} [options.success=true] - Whether the operation was successful
 * @see credit: {@link https://github.com/chitsaou/copy-as-markdown}
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


// Utility functions


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


// Function to communicate with Heliotropium extension


/**
 * Fetches date information for tabs using Heliotropium extension
 * @param {ChromeTab[]} tabs
 * @returns {Promise<Map<number, TabDateInfo>>} A map where keys are tab IDs and values are date info objects
 * @see for Heliotropium see: {@link https://github.com/myakura/heliotropium}
 */
async function fetchTabDates(tabs) {
	const unloadedTabs = tabs.filter((tab) => tab.discarded || tab.status !== 'complete');

	if (unloadedTabs.length > 0) {
		const RELOAD_TIMEOUT = 15000;

		const reloadPromises = unloadedTabs.map((tab) => {
			let listener; // Store listener reference outside Promise

			return Promise.race([
				new Promise((resolve) => {
					listener = (tabId, changeInfo) => {
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
			]).finally(() => {
				// Clean up listener regardless of how Promise resolved
				if (listener) {
					chrome.tabs.onUpdated.removeListener(listener);
				}
			});
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


// Utility functions for date parsing and sorting


/**
 * Creates a comparable Date object from a ParsedDate object
 * Returns null if the date is invalid or incomplete
 * @param {ParsedDate | null} dateObj
 * @returns {Date | null}
 */
function getComparableDate(dateObj) {
	// Only a year is strictly required. Month and day can default to 1.
	if (!dateObj || dateObj.year == null) {
		return null;
	}
	// Month is 0-indexed, so we default to month 1 (January) and day 1.
	return new Date(Date.UTC(dateObj.year, (dateObj.month || 1) - 1, dateObj.day || 1));
}


/**
 * A robust, shared function to sort tabs by date.
 * @param {ChromeTab[]} tabs
 * @param {Map<number, TabDateInfo>} tabDataMap - The map of tabIDs to date info.
 * @param {'end' | 'start' | 'preserve'} undatedPlacement - How to handle tabs without a date.
 * - 'start': Move all undated tabs to the beginning.
 * - 'end': Move all undated tabs to the end.
 * - 'preserve': Keep the original relative order of undated tabs.
 * @returns {ChromeTab[]} A new, sorted array of tabs.
 */
function sortTabsByDate(tabs, tabDataMap, undatedPlacement = 'end') {
	console.log('Sorting tabs by date...');
	console.log('Tab data map:', tabDataMap);
	console.log('Current tab ids:', tabs.map((tab) => tab.id));

	const sortedTabs = tabs.toSorted((a, b) => {
		const dateA = getComparableDate(tabDataMap.get(a.id)?.date);
		const dateB = getComparableDate(tabDataMap.get(b.id)?.date);

		// Both have dates: sort chronologically
		if (dateA && dateB) { return dateA - dateB; }

		// Neither has a date: preserve original relative order
		if (!dateA && !dateB) { return 0; }

		// One is undated
		if (!dateA) { return undatedPlacement === 'start' ? -1 : 1; }
		if (!dateB) { return undatedPlacement === 'start' ? 1 : -1; }

		// If we reach here, both are either dated or undated
		if (undatedPlacement === 'preserve') {
			if (dateA) return -1; // Only A has a date, A comes first
			if (dateB) return 1;  // Only B has a date, B comes first
		}

		return 0;
	});

	console.log('Sorted tab ids:', sortedTabs.map((tab) => tab.id));
	return sortedTabs;
}


/**
 * Detects if the system is in dark mode
 * @returns {boolean} True if dark mode is enabled, false otherwise
 */
function isDarkMode() {
	// Note: this works only on non-service-worker contexts since its dependance on `window.matchMedia`. This is intentional as there's not really cross-browser way to detect light/dark mode for icon updates.
	if (typeof window !== 'undefined' && 'matchMedia' in window) {
		return window.matchMedia('(prefers-color-scheme: dark)').matches;
	}
	return false;
}


/**
 * Updates the extension icon based on dark mode and enables/disables the extension based on the number of selected tabs
 * @todo switch to use `icon_variants` once it's widely supported
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


/**
 * Initializes the extension
 */
function initialize() {
	// Note: top-level await is not supported in service workers so this function cannot be an async function, thus being a promise chain
	updateIcon().catch((error) => {
		console.log('Error on initialization:', error);
	});

	// Icon updates
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
}


// Tab sorting functions


/**
 * Sorts selected tabs by URL and moves them to maintain their relative position
 * @param {ChromeTab[]} tabs - Array of tabs to sort by URL
 * @returns {Promise<void>}
 */
async function sortAndMoveTabsByUrl(tabs) {
	await setWorkingBadge();
	try {
		const sortedTabs = tabs.toSorted((a, b) => (a.url || '').localeCompare(b.url || ''));
		const sortedTabIds = sortedTabs.map((tab) => tab.id);

		const rightmostIndex = Math.max(...tabs.map((tab) => tab.index));
		const startIndex = rightmostIndex - sortedTabIds.length + 1;
		await chrome.tabs.move(sortedTabIds, { index: startIndex });

		await flashBadge({ success: true });
	} catch (error) {
		console.error('Error sorting tabs by URL:', error);
		await flashBadge({ success: false });
	}
}


/**
 * Sorts selected tabs by date using Heliotropium data and moves them to maintain their relative position
 * @param {ChromeTab[]} tabs - Array of tabs to sort by date
 * @param {Map<number, TabDateInfo>} tabDataMap - Map of tab IDs to their date information
 * @returns {Promise<void>}
 */
async function sortAndMoveTabsByDate(tabs, tabDataMap) {
	await setWorkingBadge();
	try {
		// Use the shared sorter, preserving undated tab order relative to each other
		const sortedTabs = sortTabsByDate(tabs, tabDataMap, 'preserve');
		const sortedTabIds = sortedTabs.map((tab) => tab.id);

		const rightmostIndex = Math.max(...tabs.map((tab) => tab.index));
		const startIndex = rightmostIndex - sortedTabIds.length + 1;
		await chrome.tabs.move(sortedTabIds, { index: startIndex });

		await flashBadge({ success: true });
	} catch (error) {
		console.error('Error sorting tabs by date:', error);
		await flashBadge({ success: false });
	}
}


/**
 * Main sorting action triggered by extension icon click
 * Attempts to sort by date first, falls back to URL sorting if Heliotropium is unavailable
 * @returns {Promise<void>}
 */
async function mainSortAction() {
	await setWorkingBadge();
	const tabs = await getSelectedTabs();
	if (tabs.length < 2) {
		await flashBadge({ success: true });
		return;
	}

	try {
		const tabDataMap = await fetchTabDates(tabs);
		await sortAndMoveTabsByDate(tabs, tabDataMap);
	} catch (error) {
		console.warn('Heliotropium fetch failed. Falling back to URL sort.', error);
		await sortAndMoveTabsByUrl(tabs);
	}
}


/**
 * Event listener for extension icon click
 */
chrome.action.onClicked.addListener(mainSortAction);


/**
 * Event listener for keyboard commands
 */
chrome.commands.onCommand.addListener(async (command) => {
	const tabs = await getSelectedTabs();
	if (tabs.length < 2) {
		await flashBadge({ success: true });
		return;
	}

	if (command === 'sort-tabs-by-url') {
		await sortAndMoveTabsByUrl(tabs);
	}
	else if (command === 'sort-tabs-by-date') {
		try {
			const tabDataMap = await fetchTabDates(tabs);
			await sortAndMoveTabsByDate(tabs, tabDataMap);
		}
		catch (error) {
			console.error('Heliotropium is required for date sorting.', error);
			await flashBadge({ success: false });
		}
	}
});


// Initialize the extension

initialize();
