async function sortSelectedTabsByUrl() {
	const tabs = await browser.tabs.query({ currentWindow: true, highlighted: true });
	console.log(`floribundus: tabs obtained: ${tabs}`);

	const leftmostIndex = Math.min(...tabs.map(tab => tab.index));
	const sortedTabs = tabs.sort((a, b) => a.url.localeCompare(b.url));

	for (let i = 0; i < sortedTabs.length; i++) {
		await browser.tabs.move(sortedTabs[i].id, { index: leftmostIndex + i });
	}
}

browser.browserAction.onClicked.addListener(async () => {
	await sortSelectedTabsByUrl();
});

browser.onCommand.addListener(async (command) => {
	if (command.name === 'sort-tabs-by-url') {
		await sortSelectedTabsByUrl();
	}
});
