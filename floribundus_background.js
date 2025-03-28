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
		console.error('Failed to update badge:', error);
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
		return null;
	}
}

async function sortSelectedTabsByUrl() {
	try {
		const tabs = await getSelectedTabs();
		if (!tabs || tabs.length === 0) {
			console.error('No tabs found.');
			await flashBadge({ success: false });
			return;
		}

		console.group('Sorting tabs...');
		tabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
		const sortedTabs = tabs.sort((a, b) => {
			const urlA = a.url || '';
			const urlB = b.url || '';
			return urlA.localeCompare(urlB);
		});

		await Promise.all(sortedTabs.map((tab, i) =>
			chrome.tabs.move(tab.id, { index: leftmostIndex + i }).catch(err => console.error(`Failed to move tab ${tab.id}:`, err))
		));

		console.group('Sorted!');
		sortedTabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		await flashBadge({ success: true });
	}
	catch (error) {
		console.log(error);
		await flashBadge({ success: false });
	}
}

async function fetchTabDates(tabs) {
	const tabIds = tabs.map((tab) => tab.id);

	const CHROME_EXTENSION_ID = 'mljeinehnapbddnpfpjiipnpdaeeemdi';
	const FIREFOX_EXTENSION_ID = '{cf75506a-2c8d-4c0c-9515-9cb34297ad37}';

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
		const response = await chrome.runtime.sendMessage(extensionId, { action: 'get-dates', tabIds });

		if (!response || !response.data || response.error) {
			console.error('Failed to fetch tab dates:', response);
			await flashBadge({ success: false });
			return fallbackData;
		}

		console.log('Received tab data with dates:', response.data);

		const dataByTabId = {};
		response.data.forEach(item => {
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
		console.error('Failed to fetch tab dates:', error);
		await flashBadge({ success: false });
		return fallbackData;
	}
}

async function sortTabsByDate(tabs, tabDataArray) {
	console.log('Sorting tabs by date...');
	console.log('Tab data:', tabDataArray);
	console.log('Current tab ids:', tabs.map(tab => tab.id));

	const dateMap = {};
	tabDataArray.forEach(({ tabId, date }) => {
		const { year = '', month = '', day = '' } = date || {};
		dateMap[tabId] = `${year}-${month}-${day}`;
	});
	console.log('Date map:', dateMap);

	const sortedTabs = tabs.sort((a, b) => {
		const dateA = dateMap[a.id] || '';
		const dateB = dateMap[b.id] || '';
		return dateA.localeCompare(dateB);
	});
	console.log('Sorted tab ids:', sortedTabs.map(tab => tab.id));

	const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
	await Promise.all(sortedTabs.map((tab, i) =>
		chrome.tabs.move(tab.id, { index: leftmostIndex + i }).catch(err => console.error(`Failed to move tab ${tab.id}:`, err))
	));

	console.log('Tabs sorted by date.');
	await flashBadge({ success: true });
}

async function sortSelectedTabsByDate() {
	try {
		const tabs = await getSelectedTabs();
		const tabDataArray = await fetchTabDates(tabs);
		await sortTabsByDate(tabs, tabDataArray);
	}
	catch (error) {
		console.log(error);
		await flashBadge({ success: false });
	}
}

chrome.action.onClicked.addListener(async () => {
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
