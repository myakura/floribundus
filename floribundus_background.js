function flashBadge({ success = true }) {
	// credit: https://github.com/chitsaou/copy-as-markdown
	const text = success ? '✔' : '✘';
	const color = success ? 'hsl(135, 70%, 30%)' : 'hsl(0, 80%, 40%)';
	const transparent = 'rgba(0, 0, 0, 0)';
	const timeout = 1000;

	chrome.browserAction.setBadgeText({ text: text });
	chrome.browserAction.setBadgeBackgroundColor({ color: color });

	setTimeout(() => {
		chrome.browserAction.setBadgeText({ text: '' });
		chrome.browserAction.setBadgeBackgroundColor({ color: transparent });
	}, timeout);
}

function getSelectedTabs() {
	const { promise, resolve, reject } = Promise.withResolvers();
	chrome.tabs.query({ currentWindow: true, highlighted: true }, (tabs) => {
		if (chrome.runtime.lastError) {
			reject(chrome.runtime.lastError);
			return;
		}
		console.group(`Tabs obtained.`, tabs);
		tabs.forEach((tab) => {
			console.log(tab.id);
			console.log(tab.url);
			console.log(tab.status);
		});
		console.groupEnd();

		resolve(tabs);
	});
	return promise;
}

function sortSelectedTabsByUrl() {
	getSelectedTabs().then((tabs) => {
		console.group('Sorting tabs...');
		tabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();

		const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
		const sortedTabs = tabs.sort((a, b) => a.url.localeCompare(b.url));

		sortedTabs.forEach((tab, i) => {
			chrome.tabs.move(tab.id, { index: leftmostIndex + i });
		});

		console.group('Sorted!');
		sortedTabs.forEach((tab) => console.log(tab.url));
		console.groupEnd();
	}).catch((error) => {
		console.error(error);
		flashBadge({ success: false });
	});
}

async function fetchTabDates(tabs) {
	const { promise, resolve, reject } = Promise.withResolvers();

	const tabIds = tabs.map(tab => tab.id);
	const CHROME_EXTENSION_ID = 'mljeinehnapbddnpfpjiipnpdaeeemdi';
	const port = chrome.runtime.connect(CHROME_EXTENSION_ID);

	console.log('Connected to the external extension.', port);

	port.postMessage({ action: 'get-dates-from-selected-tabs', tabIds });

	port.onMessage.addListener((response) => {
		if (response.error) {
			console.error(response.error);
			flashBadge({ success: false });
			reject(response.error);
			return;
		}
		console.log('Received tab data with dates:', response.data);
		resolve(response.data);
	});

	port.onDisconnect.addListener(() => {
		console.log('Disconnected from the external extension.');
	});

	return promise;
}

function sortTabsByDate(tabs, tabDataArray) {
	const dateMap = {};
	tabDataArray.forEach(({ tabId, date }) => {
		dateMap[tabId] = date;
	});

	const sortedTabs = tabs.sort((a, b) => {
		const dateA = dateMap[a.id];
		const dateB = dateMap[b.id];
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
	} catch (error) {
		console.error(error);
		flashBadge({ success: false });
	}
}

chrome.browserAction.onClicked.addListener(async () => {
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

function updateIcon() {
	getSelectedTabs().then((tabs) => {
		if (tabs.length < 2) {
			chrome.browserAction.setIcon({ path: 'icons/icon_lightgray.png' });
			return;
		}
		const mqDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
		const isDarkMode = mqDarkMode?.matches ?? false;
		const icon = isDarkMode ? 'icons/icon_white.png' : 'icons/icon_black.png';
		chrome.browserAction.setIcon({ path: icon });
	}).catch((error) => {
		console.error(error);
	});
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
