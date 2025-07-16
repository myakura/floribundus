/**
 * @typedef {Object} ChromeTab
 * @property {number} id - The ID of the tab. Tab IDs are unique within a browser session
 * @property {number} index - The zero-based index of the tab within its window
 * @property {number} windowId - The ID of the window the tab is contained within
 * @property {string} [url] - The URL the tab is displaying. This property is only present if the extension's manifest includes the "tabs" permission
 * @property {string} [title] - The title of the tab. This property is only present if the extension's manifest includes the "tabs" permission
 * @property {string} status - Either "loading" or "complete"
 * @property {boolean} active - Whether the tab is active in its window (does not necessarily mean the window is focused)
 * @property {boolean} highlighted - Whether the tab is highlighted
 * @property {boolean} pinned - Whether the tab is pinned
 * @property {boolean} discarded - Whether the tab is discarded. A discarded tab is one whose content has been unloaded from memory
 * @property {boolean} incognito - Whether the tab is in an incognito window
 * @property {number} [openerTabId] - The ID of the tab that opened this tab, if any
 * @property {string} [pendingUrl] - The URL the tab is navigating to, before it has committed
 * @property {number} [groupId] - The ID of the group that the tab belongs to
 */

/**
 * @typedef {Object} ParsedDate
 * @property {string|null} year - The year as a string
 * @property {string|null} month - The month as a zero-padded string
 * @property {string|null} day - The day as a zero-padded string
 */

/**
 * @typedef {Object} TabDateInfo
 * @property {number} tabId
 * @property {string} url
 * @property {string|null} title
 * @property {string|null} dateString - The raw date string found on the page
 * @property {ParsedDate|null} date - The parsed date object
 */

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

		return tabs;
	}
	catch (error) {
		console.error('Failed to get selected tabs:', error);
		return [];
	}
}

/**
 * Moves tabs to new positions to match the sorted order
 * @param {ChromeTab[]} originalTabs - The original unsorted tabs
 * @param {ChromeTab[]} sortedTabs - The tabs in their new sorted order
 */
async function moveTabs(originalTabs, sortedTabs) {
	// Align tabs to the right edge of the selected tabs
	const rightmostIndex = Math.max(...originalTabs.map(tab => tab.index));
	const startIndex = rightmostIndex - sortedTabs.length + 1;

	console.group('Sorting tabs...');
	originalTabs.forEach((tab) => console.log(tab.url));
	console.groupEnd();

	try {
		// Move tabs sequentially from the back to avoid index shifting issues
		for (let i = sortedTabs.length - 1; i >= 0; i--) {
			await chrome.tabs.move(sortedTabs[i].id, { index: startIndex + i });
		}

		console.group('Sorted!');
		sortedTabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		await flashBadge({ success: true });
	}
	catch (error) {
		console.error('Error moving tabs:', error);
		await flashBadge({ success: false });
	}
}

/**
 * Sorts the currently selected tabs alphabetically by URL
 */
async function sortSelectedTabsByUrl() {
	try {
		await setWorkingBadge();
		const tabs = await getSelectedTabs();
		if (!tabs || tabs.length === 0) {
			console.log('No tabs found.');
			await flashBadge({ success: false });
			return;
		}

		const sortedTabs = tabs.toSorted((a, b) => {
			const urlA = a.url || '';
			const urlB = b.url || '';
			return urlA.localeCompare(urlB);
		});

		await moveTabs(tabs, sortedTabs);
	}
	catch (error) {
		console.log(error);
		await flashBadge({ success: false });
	}
}

/**
 * Fetches date information for tabs using the heliotropium extension
 * @param {ChromeTab[]} tabs
 * @returns {Promise<TabDateInfo[]>} Array of tab data objects with date information from heliotropium extension
 */
async function fetchTabDates(tabs) {
	const unloadedTabs = tabs.filter(tab => tab.discarded || tab.status !== 'complete');

	if (unloadedTabs.length > 0) {
		const reloadPromises = unloadedTabs.map(tab => {
			return new Promise(resolve => {
				const listener = (tabId, changeInfo) => {
					if (tabId === tab.id && changeInfo.status === 'complete') {
						chrome.tabs.onUpdated.removeListener(listener);
						resolve();
					}
				};
				chrome.tabs.onUpdated.addListener(listener);
				chrome.tabs.reload(tab.id);
			});
		});
		await Promise.all(reloadPromises);
	}

	const tabIds = tabs.map((tab) => tab.id);

	const manifest = chrome.runtime.getManifest();
	const { FIREFOX_EXTENSION_ID, CHROME_EXTENSION_ID } = manifest.externals.heliotropium;
	const extensionId = navigator.userAgent.includes('Firefox')
		? FIREFOX_EXTENSION_ID
		: CHROME_EXTENSION_ID;

	const fallbackData = tabIds.map(tabId => {
		const tab = tabs.find(t => t.id === tabId);
		return {
			tabId,
			url: tab.url,
			title: null,
			dateString: null,
			date: { year: null, month: null, day: null },
		};
	});

	try {
		console.log('Sending message to extension:', { action: 'get-dates', tabIds });

		const response = await chrome.runtime.sendMessage(extensionId, { action: 'get-dates', tabIds });

		console.log('Raw response from extension:', response);
		console.log('Response type:', typeof response);

		// Handle different response formats
		let processedData;

		if (!response) {
			console.log('No response from extension');
			await flashBadge({ success: false });
			return fallbackData;
		}
		else if (response.error) {
			console.log('Extension returned error:', response.error);
			await flashBadge({ success: false });
			return fallbackData;
		}
		else if (response.data && Array.isArray(response.data)) {
			// Expected format: { data: [...] }
			console.log('Using response.data array');
			processedData = response.data;
		}
		else {
			console.log('Unexpected response format:', response);
			await flashBadge({ success: false });
			return fallbackData;
		}

		console.log('Processed data:', processedData);

		const dataByTabId = {};
		processedData.forEach(item => {
			dataByTabId[item.tabId] = item;
		});

		const completeData = tabIds.map(tabId => {
			if (dataByTabId[tabId]) {
				return dataByTabId[tabId];
			}
			else {
				const tab = tabs.find(t => t.id === tabId);
				return {
					tabId,
					url: tab.url,
					title: null,
					dateString: null,
					date: { year: null, month: null, day: null },
				};
			}
		});

		return completeData;
	}
	catch (error) {
		console.log('Failed to fetch tab dates:', error);
		await flashBadge({ success: false });
		return fallbackData;
	}
}

/**
 * Sorts the currently selected tabs by date using data from heliotropium extension
 */
async function sortSelectedTabsByDate() {
	try {
		await setWorkingBadge();
		const tabs = await getSelectedTabs();
		const tabDataArray = await fetchTabDates(tabs);

		console.log('Sorting tabs by date...');
		console.log('Tab data:', tabDataArray);
		console.log('Current tab ids:', tabs.map(tab => tab.id));

		const dateMap = {};
		tabDataArray.forEach(({ tabId, date }) => {
			const { year = '', month = '', day = '' } = date || {};
			dateMap[tabId] = `${year}-${month}-${day}`;
		});
		console.log('Date map:', dateMap);

		const sortedTabs = tabs.toSorted((a, b) => {
			const dateA = dateMap[a.id] || '';
			const dateB = dateMap[b.id] || '';
			return dateA.localeCompare(dateB);
		});

		await moveTabs(tabs, sortedTabs);
	}
	catch (error) {
		console.log(error);
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
	if (typeof window === 'undefined' || !('matchMedia' in window)) {
		return false;
	}
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
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
 * Initializes the extension by calling updateIcon
 * Note: top-level await is not supported in service workers
 */
function initialize() {
	updateIcon().catch((error) => {
		console.log('Error on initialization:', error);
	});
}

initialize();
