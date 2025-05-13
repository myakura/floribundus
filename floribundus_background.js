async function flashBadge({ success = true }) {
	// credit: https://github.com/chitsaou/copy-as-markdown
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
		console.log(error);
	}
}

async function getSelectedTabs() {
	try {
		const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });

		console.group('Tabs obtained.');
		tabs.forEach((tab) => console.log(tab.id, tab.url, tab.title));
		console.groupEnd();

		return tabs;
	}
	catch (error) {
		console.log(error);
		return [];
	}
}

async function moveTabs(originalTabs, sortedTabs) {
	const startIndex = Math.min(...originalTabs.map(tab => tab.index));

	console.group('Sorting tabs...');
	originalTabs.forEach((tab) => console.log(tab.url));
	console.groupEnd();

	try {
		await Promise.all(sortedTabs.map((tab, i) =>
			chrome.tabs.move(tab.id, { index: startIndex + i })
				.catch(err => console.log(`Failed to move tab ${tab.id}:`, err))
		));

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

async function sortSelectedTabsByUrl() {
	try {
		const tabs = await getSelectedTabs();
		if (!tabs || tabs.length === 0) {
			console.log('No tabs found.');
			await flashBadge({ success: false });
			return;
		}

		const sortedTabs = [...tabs].sort((a, b) => {
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

async function fetchTabDates(tabs) {
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

		if (response === true) {
			console.warn('Extension returned boolean true instead of data');
			return fallbackData;
		}
		else if (!response) {
			console.log('No response from extension');
			await flashBadge({ success: false });
			return fallbackData;
		}
		else if (response.error) {
			console.log('Extension returned error:', response.error);
			await flashBadge({ success: false });
			return fallbackData;
		}
		else if (Array.isArray(response)) {
			// Some extensions might return the data directly as an array
			console.log('Response is an array, using directly');
			processedData = response;
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

async function sortSelectedTabsByDate() {
	try {
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

		const sortedTabs = [...tabs].sort((a, b) => {
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

function isDarkMode() {
	if (typeof window === 'undefined' || !('matchMedia' in window)) {
		return false;
	}
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

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

// top-level await is not supported in service workers
function initialize() {
	updateIcon().catch((error) => {
		console.log('Error on initialization:', error);
	});
}

initialize();
