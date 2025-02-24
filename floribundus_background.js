function flashBadge({ success = true }) {
	// credit: https://github.com/chitsaou/copy-as-markdown
	const text = success ? '✔' : '✘';
	const color = success ? 'hsl(135, 70%, 30%)' : 'hsl(0, 80%, 40%)';
	const transparent = 'rgba(0, 0, 0, 0)';
	const timeout = 1000;

	chrome.action.setBadgeText({ text: text });
	chrome.action.setBadgeBackgroundColor({ color: color });

	setTimeout(() => {
		chrome.action.setBadgeText({ text: '' });
		chrome.action.setBadgeBackgroundColor({ color: transparent });
	}, timeout);
}

async function getSelectedTabs() {
	try {
		const tabs = await chrome.tabs.query({ currentWindow: true, highlighted: true });

		console.group('Tabs obtained.', tabs);
		tabs.forEach((tab) => console.log(tab.id, tab.url, tab.status));
		console.groupEnd();

		return tabs;
	}
	catch (error) {
		console.log(error);
		return null;
	}
}

async function sortSelectedTabsByUrl() {
	try {
		const tabs = await getSelectedTabs();

		console.group('Sorting tabs...');
		tabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
		const sortedTabs = tabs.sort((a, b) => {
			const urlA = a.url || '';
			const urlB = b.url || '';
			return urlA.localeCompare(urlB);
		});

		sortedTabs.forEach((tab, i) => {
			chrome.tabs.move(tab.id, { index: leftmostIndex + i });
		});

		console.group('Sorted!');
		sortedTabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		flashBadge();
	}
	catch (error) {
		console.log(error);
		flashBadge({ success: false });
	}
}

function fetchTabDates(tabs) {
	const { promise, resolve, reject } = Promise.withResolvers();
	const tabIds = tabs.map((tab) => tab.id);

	const CHROME_EXTENSION_ID = 'mljeinehnapbddnpfpjiipnpdaeeemdi';
	const FIREFOX_EXTENSION_ID = '{cf75506a-2c8d-4c0c-9515-9cb34297ad37}';

	const extensionId = navigator.userAgent.includes('Firefox')
		? FIREFOX_EXTENSION_ID
		: CHROME_EXTENSION_ID;

	chrome.runtime.sendMessage(extensionId, { action: 'get-dates', tabIds }, (response) => {
		console.log('Got a response', response);

		if (chrome.runtime.lastError) {
			console.error('Failed to connect to extension:', chrome.runtime.lastError);
			flashBadge({ success: false });
			reject(new Error(chrome.runtime.lastError.message));
			return;
		}

		if (!response) {
			flashBadge({ success: false });
			reject(new Error('No response'));
			return;
		}

		if (response.error) {
			flashBadge({ success: false });
			reject(new Error(response.error));
			return;
		}

		console.log('Received tab data with dates:', response.data);
		resolve(response.data);
	});

	return promise;
}

function sortTabsByDate(tabs, tabDataArray) {
	const dateMap = {};
	tabDataArray.forEach(({ tabId, date }) => {
		const { year = '', month = '', day = '' } = date || {};
		dateMap[tabId] = `${year}-${month}-${day}`;
	});

	const sortedTabs = tabs.sort((a, b) => {
		const dateA = dateMap[a.id] || '';
		const dateB = dateMap[b.id] || '';
		return dateA.localeCompare(dateB);
	});

	const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
	sortedTabs.forEach((tab, i) => {
		chrome.tabs.move(tab.id, { index: leftmostIndex + i });
	});

	console.log('Tabs sorted by date.');
	flashBadge();
}

async function sortSelectedTabsByDate() {
	try {
		const tabs = await getSelectedTabs();
		const tabDataArray = await fetchTabDates(tabs);
		sortTabsByDate(tabs, tabDataArray);
	}
	catch (error) {
		console.log(error);
		flashBadge({ success: false });
	}
}

chrome.action.onClicked.addListener(async () => {
	await sortSelectedTabsByDate();
});

chrome.commands.onCommand.addListener(async (command) => {
	if (command === 'sort-tabs-by-url') {
		sortSelectedTabsByUrl();
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
	try {
		// visually disable the extension when there's no need to sort tabs
		const tabs = await getSelectedTabs();
		if (tabs.length < 2) {
			chrome.action.setIcon({ path: 'icons/icon_lightgray.png' });
			return;
		}
		const icon = isDarkMode() ? 'icons/icon_white.png' : 'icons/icon_black.png';
		chrome.action.setIcon({ path: icon });
	}
	catch (error) {
		console.log(error);
	}
}

chrome.windows.onFocusChanged.addListener(() => {
	updateIcon();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
	console.log('Tab activated:', tabId);
	updateIcon();
});

chrome.tabs.onHighlighted.addListener(({ tabIds }) => {
	console.log('Tab highlighted:', tabIds);
	updateIcon();
});

updateIcon();
