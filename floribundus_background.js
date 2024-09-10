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
		console.group(`floribundus: tabs obtained.`);
		tabs.forEach((tab) => {
			console.log(tab);
		});
		console.groupEnd();

		resolve(tabs);
	});
	return promise;
}

function sortSelectedTabsByUrl() {
	getSelectedTabs().then((tabs) => {
		const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
		const sortedTabs = tabs.sort((a, b) => a.url.localeCompare(b.url));

		sortedTabs.forEach((tab, i) => {
			chrome.tabs.move(tab.id, { index: leftmostIndex + i });
		});
	}).catch((error) => {
		console.error(error);
		flashBadge({ success: false });
	});
}

chrome.browserAction.onClicked.addListener(() => {
	sortSelectedTabsByUrl();
});

chrome.commands.onCommand.addListener((command) => {
	if (command === 'sort-tabs-by-url') {
		sortSelectedTabsByUrl();
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
chrome.tabs.onActivated.addListener(() => {
	updateIcon();
});
chrome.tabs.onHighlighted.addListener(() => {
	updateIcon();
});

updateIcon();
