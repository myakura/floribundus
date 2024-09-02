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
