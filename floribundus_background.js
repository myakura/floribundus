function sortSelectedTabsByUrl() {
	chrome.tabs.query({ currentWindow: true, highlighted: true }, (tabs) => {
		console.log(`floribundus: tabs obtained: ${tabs}`);

		const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
		const sortedTabs = tabs.sort((a, b) => a.url.localeCompare(b.url));

		sortedTabs.forEach((tab, i) => {
			chrome.tabs.move(tab.id, { index: leftmostIndex + i });
		});
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
	chrome.tabs.query({ currentWindow: true, highlighted: true }, (tabs) => {
		if (tabs.length < 2) {
			chrome.browserAction.setIcon({ path: 'icons/icon_lightgray.png' });
			return;
		}
	});

	const mqDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
	const isDarkMode = mqDarkMode?.matches ?? false;
	const icon = isDarkMode ? 'icons/icon_white.png' : 'icons/icon_black.png';
	chrome.browserAction.setIcon({ path: icon });
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
